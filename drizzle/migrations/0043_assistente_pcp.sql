-- Assistente do PCP, 1ª leva (fluxo de produção, etapa 9 ampliada; docs/fluxo-producao-plano.md).
-- Um painel lateral abre sozinho quando o PCP vai responder um "Solicitar prazo" ou aprovar uma
-- liberação, com a carga de trabalho e as sugestões de uma IA. A IA só sugere; nada é gravado.
--   * contexto_assistente_pcp(momento, id): o resumo que a IA recebe e o painel mostra. Só
--     Gestão e PCP (can_gerir_operacao); security invoker, então cada tabela segue o RLS.
--     Sem contatos, telefones nem dados bancários: só números, situações e o que falta.
--   * registrar_uso_ia: Gestão e PCP passam a ter 100 consultas por dia (o assistente abre
--     sozinho); os outros continuam com 40.
-- Depende de 0015, 0019, 0033, 0036, 0039 e 0040.

-- ---------- 1) Limite diário maior para Gestão e PCP ----------
create or replace function public.registrar_uso_ia()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_limite integer := case when public.can_gerir_operacao(auth.uid()) then 100 else 40 end;
  v_pedidos integer;
begin
  if auth.uid() is null or not public.is_team_member(auth.uid()) then
    return 'nao_membro';
  end if;
  insert into public.ia_uso (user_id, pedidos) values (auth.uid(), 1)
  on conflict (user_id, dia) do update set pedidos = public.ia_uso.pedidos + 1
  returning pedidos into v_pedidos;
  if v_pedidos > v_limite then
    return 'limite';
  end if;
  return 'ok';
end $$;
revoke execute on function public.registrar_uso_ia() from public, anon;
grant execute on function public.registrar_uso_ia() to authenticated;

-- ---------- 2) Carga de trabalho (as próximas 8 semanas) ----------
-- Por semana (segunda a domingo): ordens abertas com data prevista na semana, por tipo, e as
-- etapas ainda abertas delas; serviços na Programação por setor; ordens atrasadas; a
-- capacidade das equipes ativas por setor; e quantos dias as ordens levaram, por tipo, nos
-- últimos 180 dias (da criação à conclusão).
create or replace function public.carga_producao(p_hoje date default null)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with hoje as (
    select coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date) as d
  ), semanas as (
    select (date_trunc('week', h.d)::date + 7 * n) as inicio
    from hoje h, generate_series(0, 7) n
  ), abertas as (
    select o.id, o.tipo, o.data_prevista, o.status,
      (select count(*) from public.ordens_producao_etapas e where e.ordem_id = o.id and not e.concluido) as etapas_abertas
    from public.ordens_producao o
    where o.status not in ('Concluída', 'Cancelada', 'Aguardando cliente')
  )
  select jsonb_build_object(
    'hoje', (select d from hoje),
    'semanas', (
      select jsonb_agg(jsonb_build_object(
        'inicio', s.inicio,
        'ordens', (select count(*) from abertas a where a.data_prevista between s.inicio and s.inicio + 6),
        'por_tipo', coalesce((select jsonb_object_agg(t.tipo, t.n) from (
            select a.tipo, count(*) as n from abertas a
            where a.data_prevista between s.inicio and s.inicio + 6 group by a.tipo) t), '{}'::jsonb),
        'etapas_abertas', (select coalesce(sum(a.etapas_abertas), 0) from abertas a
                           where a.data_prevista between s.inicio and s.inicio + 6),
        'programacao_por_setor', coalesce((select jsonb_object_agg(p.setor, p.n) from (
            select ps.setor, count(*) as n from public.programacao_servicos ps
            where ps.data between s.inicio and s.inicio + 6 and ps.status <> 'Não realizado'
            group by ps.setor) p), '{}'::jsonb)
      ) order by s.inicio)
      from semanas s),
    'atrasadas', (select count(*) from abertas a, hoje h where a.data_prevista < h.d),
    'sem_data', (select count(*) from abertas a where a.data_prevista is null),
    'aguardando_liberacao', (select count(*) from abertas a where a.status = 'Aguardando liberação'),
    'capacidade_horas_dia_por_setor', coalesce((select jsonb_object_agg(c.setor, c.horas) from (
        select setor, sum(capacidade_horas_dia) as horas from public.producao_equipes
        where ativo group by setor) c), '{}'::jsonb),
    'dias_ate_concluir_por_tipo', coalesce((select jsonb_object_agg(x.tipo, jsonb_build_object(
          'ordens', x.n, 'mediana_dias', x.mediana)) from (
        select tipo, count(*) as n,
          round((percentile_cont(0.5) within group (order by extract(epoch from (data_conclusao - created_at)) / 86400))::numeric, 1) as mediana
        from public.ordens_producao
        where status = 'Concluída' and data_conclusao >= now() - interval '180 days'
        group by tipo) x), '{}'::jsonb)
  );
$$;
revoke all on function public.carga_producao(date) from public, anon;
grant execute on function public.carga_producao(date) to authenticated;

-- ---------- 3) O contexto de cada momento ----------
-- momento 'prazo': id = pedido_prazos.id (pedido de prazo em aberto).
-- momento 'liberacao': id = liberacoes.id.
create or replace function public.contexto_assistente_pcp(p_momento text, p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v jsonb;
  pp public.pedido_prazos%rowtype;
  l public.liberacoes%rowtype;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'O assistente é só para Gestão e PCP' using errcode = '42501';
  end if;

  if p_momento = 'prazo' then
    select * into pp from public.pedido_prazos where id = p_id;
    if not found then raise exception 'Pedido de prazo não encontrado'; end if;
    select jsonb_build_object(
      'momento', 'prazo',
      'pedido', jsonb_build_object(
        'numero', v2.numero, 'status', v2.status, 'cliente', coalesce(c.nome, ''),
        'itens', coalesce((select jsonb_agg(jsonb_build_object(
            'categoria', i.categoria, 'descricao', i.descricao, 'quantidade', i.quantidade,
            'periodo_inicio', i.periodo_inicio, 'periodo_fim', i.periodo_fim) order by i.ordem)
          from public.vendas_itens i where i.venda_id = v2.id), '[]'::jsonb)),
      'pedido_de_prazo', jsonb_build_object(
        'data_desejada', pp.data_desejada, 'observacao', pp.observacao,
        'solicitado_em', pp.solicitado_em, 'status', pp.status),
      'carga', public.carga_producao())
    into v
    from public.vendas v2 left join public.cadastros c on c.id = v2.cadastro_id
    where v2.id = pp.venda_id;
    return v;
  end if;

  if p_momento = 'liberacao' then
    select * into l from public.liberacoes where id = p_id;
    if not found then raise exception 'Liberação não encontrada'; end if;
    return jsonb_build_object(
      'momento', 'liberacao',
      'liberacao', jsonb_build_object(
        'numero', l.numero, 'modelo', l.modelo, 'status', l.status, 'cliente', l.cliente,
        'tem_pedido', l.venda_id is not null, 'motivo_sem_pedido', l.motivo_sem_pedido,
        'data_entrega', l.data_entrega, 'enviada_em', l.enviada_em,
        -- Só se o campo está preenchido, nunca o conteúdo de contato ou endereço.
        'preenchidos', jsonb_build_object(
          'responsavel', btrim(l.responsavel) <> '', 'contato', btrim(l.contato) <> '',
          'endereco', btrim(l.endereco) <> '', 'projetista', btrim(l.projetista) <> '',
          'vendedor', btrim(l.vendedor) <> '', 'data_entrega', l.data_entrega is not null,
          'bissemana', btrim(l.bissemana) <> '', 'ponto_energia', btrim(l.ponto_energia) <> '',
          'horario_instalacao', btrim(l.horario_instalacao) <> '', 'observacoes', btrim(l.observacoes) <> ''),
        'itens', coalesce((select jsonb_agg(jsonb_build_object(
            'servico', i.servico, 'insumos', i.insumos, 'acabamento', i.acabamento,
            'instalacao', i.instalacao, 'tem_medidas', i.largura_cm is not null and i.altura_cm is not null,
            'quantidade', i.quantidade, 'tem_local', btrim(i.local_instalacao) <> '') order by i.position)
          from public.liberacao_itens i where i.liberacao_id = l.id), '[]'::jsonb),
        'prazo_dado_pelo_pcp', (select pz.prazo from public.pedido_prazos pz
                                where pz.venda_id = l.venda_id and pz.status = 'respondido'
                                order by pz.respondido_em desc limit 1)),
      'ordens', coalesce((select jsonb_agg(jsonb_build_object(
          'numero', o.numero, 'tipo', o.tipo, 'descricao', o.descricao, 'data_prevista', o.data_prevista,
          'checklist', (select ck.name from public.checklists ck where ck.id = o.checklist_id),
          'etapas', (select count(*) from public.ordens_producao_etapas e where e.ordem_id = o.id),
          'tem_ponto', o.ponto_id is not null) order by o.numero)
        from public.ordens_producao o where o.liberacao_id = l.id), '[]'::jsonb),
      'checklists_disponiveis', coalesce((select jsonb_agg(jsonb_build_object(
          'nome', ck.name, 'descricao', ck.description, 'parametros_fixos', ck.fixed_params,
          'tarefas', (select count(*) from public.checklist_tasks t where t.checklist_id = ck.id)) order by ck.name)
        from public.checklists ck
        where exists (select 1 from public.checklist_tasks t where t.checklist_id = ck.id)), '[]'::jsonb),
      'carga', public.carga_producao());
  end if;

  raise exception 'Momento desconhecido: %', p_momento;
end;
$$;
revoke all on function public.contexto_assistente_pcp(text, uuid) from public, anon;
grant execute on function public.contexto_assistente_pcp(text, uuid) to authenticated;
