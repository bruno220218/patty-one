-- Assistente do PCP, 2ª leva (fluxo de produção, etapa 9 ampliada): Programação do dia e ordem.
--   * contexto_assistente_pcp ganha o momento 'ordem' (id = ordens_producao.id): a ordem, as
--     etapas com o tempo apontado, a última pausa e a mediana de horas da mesma etapa no
--     histórico, a programação e os eventos recentes. Serve também para a conferência (situação
--     Aguardando conferência). Os momentos 'prazo' e 'liberacao' ficam iguais à 0043.
--   * contexto_programacao_pcp(data): os serviços do dia por setor com equipe, líder e veículo,
--     as pessoas e os veículos em mais de um serviço no dia, as ordens abertas sem programação
--     (prazo mais perto primeiro), as pendências de dias anteriores e a capacidade por setor.
-- Só Gestão e PCP (can_gerir_operacao); security invoker. Sem contatos nem dados bancários.
-- Depende de 0043.

-- ---------- 1) Momento 'ordem' ----------
create or replace function public.contexto_assistente_pcp(p_momento text, p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v jsonb;
  pp public.pedido_prazos%rowtype;
  l public.liberacoes%rowtype;
  ord public.ordens_producao%rowtype;
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

  if p_momento = 'ordem' then
    select * into ord from public.ordens_producao where id = p_id;
    if not found then raise exception 'Ordem não encontrada'; end if;
    return jsonb_build_object(
      'momento', 'ordem',
      'ordem', jsonb_build_object(
        'numero', ord.numero, 'tipo', ord.tipo, 'status', ord.status, 'prioridade', ord.prioridade,
        'complexidade', ord.complexidade, 'descricao', ord.descricao, 'data_prevista', ord.data_prevista,
        'criada_em', ord.created_at, 'tem_pedido', ord.venda_id is not null,
        'motivo_sem_pedido', ord.motivo_sem_pedido, 'etapas_fixas', ord.etapas_fixas,
        'servico', (select s.nome from public.producao_servicos s where s.id = ord.servico_id),
        'checklist', (select ck.name from public.checklists ck where ck.id = ord.checklist_id),
        'pessoas_na_equipe', (select count(*) from public.ordens_producao_equipe e where e.ordem_id = ord.id),
        'conferido_em', ord.conferido_em),
      -- Etapas com o tempo apontado e a mediana de horas da mesma etapa (mesmo nome e tipo) nas
      -- ordens concluídas dos últimos 180 dias, para achar a parada ou a que está estourando.
      'etapas', coalesce((select jsonb_agg(jsonb_build_object(
          'ordem', e.ordem, 'nome', e.nome, 'concluida', e.concluido, 'concluida_em', e.concluido_em,
          'em_andamento', exists (select 1 from public.ordens_producao_apontamentos a
                                  where a.etapa_id = e.id and a.fim is null),
          'horas_pessoa', (select round(coalesce(sum(extract(epoch from (coalesce(a.fim, now()) - a.inicio)) / 3600.0 * a.pessoas), 0)::numeric, 1)
                           from public.ordens_producao_apontamentos a where a.etapa_id = e.id),
          'ultima_pausa', (select a.motivo_pausa from public.ordens_producao_apontamentos a
                           where a.etapa_id = e.id and a.fim_tipo = 'pausa' order by a.fim desc limit 1),
          'ultimo_movimento', (select max(coalesce(a.fim, a.inicio)) from public.ordens_producao_apontamentos a
                               where a.etapa_id = e.id),
          'mediana_horas_historico', (
            select round((percentile_cont(0.5) within group (order by h.horas))::numeric, 1)
            from (select sum(extract(epoch from (a2.fim - a2.inicio)) / 3600.0 * a2.pessoas) as horas
                  from public.ordens_producao_etapas e2
                  join public.ordens_producao o2 on o2.id = e2.ordem_id
                  join public.ordens_producao_apontamentos a2 on a2.etapa_id = e2.id and a2.fim is not null
                  where e2.concluido and e2.nome = e.nome and o2.tipo = ord.tipo and o2.id <> ord.id
                    and e2.concluido_em >= now() - interval '180 days'
                  group by e2.id) h)) order by e.ordem)
        from public.ordens_producao_etapas e where e.ordem_id = ord.id), '[]'::jsonb),
      'programacao', coalesce((select jsonb_agg(jsonb_build_object(
          'data', ps.data, 'setor', ps.setor, 'status', ps.status) order by ps.data)
        from public.programacao_servicos ps where ps.ordem_id = ord.id), '[]'::jsonb),
      'eventos_recentes', coalesce((select jsonb_agg(x.descricao order by x.created_at desc) from (
          select ev.descricao, ev.created_at from public.ordens_producao_eventos ev
          where ev.ordem_id = ord.id order by ev.created_at desc limit 8) x), '[]'::jsonb),
      'carga', public.carga_producao());
  end if;

  raise exception 'Momento desconhecido: %', p_momento;
end;
$$;
revoke all on function public.contexto_assistente_pcp(text, uuid) from public, anon;
grant execute on function public.contexto_assistente_pcp(text, uuid) to authenticated;

-- ---------- 2) Programação do dia ----------
create or replace function public.contexto_programacao_pcp(p_data date)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'O assistente é só para Gestão e PCP' using errcode = '42501';
  end if;
  if p_data is null then raise exception 'Informe o dia'; end if;
  return jsonb_build_object(
    'momento', 'programacao',
    'dia', p_data,
    'hoje', v_hoje,
    'servicos', coalesce((select jsonb_agg(jsonb_build_object(
        'setor', ps.setor, 'cliente', ps.cliente, 'servico', coalesce(nullif(ps.servico, ''), ps.produto),
        'status', ps.status, 'hora_inicio', ps.hora_inicio, 'hora_fim', ps.hora_fim,
        'equipe', (select eq.nome from public.producao_equipes eq where eq.id = ps.equipe_id),
        'lider', (select c.nome from public.producao_colaboradores c where c.id = ps.lider_id),
        'ajudantes', (select count(*) from public.programacao_servicos_ajudantes aj where aj.servico_id = ps.id),
        'veiculo', (select coalesce(nullif(v.apelido, ''), v.placa) from public.producao_veiculos v where v.id = ps.veiculo_id),
        'reagendamentos', ps.reagendamentos, 'conflito_confirmado', ps.conflito_confirmado,
        'ordem', (select jsonb_build_object('numero', o.numero, 'status', o.status,
                    'data_prevista', o.data_prevista, 'prioridade', o.prioridade)
                  from public.ordens_producao o where o.id = ps.ordem_id)) order by ps.setor, ps.posicao)
      from public.programacao_servicos ps where ps.data = p_data), '[]'::jsonb),
    -- Pessoas (líder ou ajudante) e veículos em mais de um serviço no dia.
    'pessoas_em_mais_de_um', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'servicos', x.n)) from (
        select c.nome, count(distinct p.servico_id) as n
        from (select ps.id as servico_id, ps.lider_id as colaborador_id from public.programacao_servicos ps
              where ps.data = p_data and ps.lider_id is not null and ps.status <> 'Não realizado'
              union
              select aj.servico_id, aj.colaborador_id from public.programacao_servicos_ajudantes aj
              join public.programacao_servicos ps on ps.id = aj.servico_id
              where ps.data = p_data and ps.status <> 'Não realizado') p
        join public.producao_colaboradores c on c.id = p.colaborador_id
        group by c.nome having count(distinct p.servico_id) > 1) x), '[]'::jsonb),
    'veiculos_em_mais_de_um', coalesce((select jsonb_agg(jsonb_build_object('veiculo', x.nome, 'servicos', x.n)) from (
        select coalesce(nullif(v.apelido, ''), v.placa) as nome, count(*) as n
        from public.programacao_servicos ps join public.producao_veiculos v on v.id = ps.veiculo_id
        where ps.data = p_data and ps.status <> 'Não realizado'
        group by v.id, v.apelido, v.placa having count(*) > 1) x), '[]'::jsonb),
    'ordens_sem_programacao', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', o.numero, 'tipo', o.tipo, 'status', o.status, 'prioridade', o.prioridade,
        'data_prevista', o.data_prevista, 'descricao', o.descricao,
        'etapas_abertas', (select count(*) from public.ordens_producao_etapas e where e.ordem_id = o.id and not e.concluido))
        order by o.data_prevista nulls last, o.numero)
      from (select * from public.ordens_producao o
            where o.status in ('Aguardando', 'Em andamento')
              and not exists (select 1 from public.programacao_servicos ps where ps.ordem_id = o.id and ps.data >= v_hoje)
            order by o.data_prevista nulls last, o.numero limit 25) o), '[]'::jsonb),
    'pendencias', jsonb_build_object(
      'sem_baixa', (select count(*) from public.programacao_servicos ps
                    where ps.data < v_hoje and ps.status in ('Programado', 'Em andamento')),
      'nao_realizados_ou_sem_equipe', (select count(*) from public.programacao_servicos ps
                    where ps.status in ('Não realizado', 'Aguardando equipe') and ps.data >= v_hoje - 30)),
    'capacidade_horas_dia_por_setor', coalesce((select jsonb_object_agg(c.setor, c.horas) from (
        select setor, sum(capacidade_horas_dia) as horas from public.producao_equipes where ativo group by setor) c), '{}'::jsonb),
    'carga', public.carga_producao());
end;
$$;
revoke all on function public.contexto_programacao_pcp(date) from public, anon;
grant execute on function public.contexto_programacao_pcp(date) to authenticated;
