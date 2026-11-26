-- Fluxo de produção, etapa 5 (docs/fluxo-producao-plano.md): mudança no pedido depois da liberação.
-- O pedido continua editável. Quando um pedido que tem liberação é salvo (salvar_venda):
--   * o que mudou para a produção vira um comentário automático no histórico da liberação
--     (tipo 'alteracao_pedido'): situação, cliente, vendedor, observação e, por item, descrição,
--     categoria, ponto, período e quantidade (valores e descontos não entram);
--   * item novo ganha uma ordem nova (como na etapa 4);
--   * item removido cancela a ordem dele se ela ainda não começou; se começou, a ordem continua e
--     o comentário avisa;
--   * PCP e direção recebem o aviso 'liberacao_pedido_alterado' (quem mudou não recebe).
-- Pedido sem liberação: nada muda. Substitui salvar_venda da 0034 (o resto igual).
-- 0037 é de outra frente; esta é a 0038. Depende de 0024 (comentários), 0034 e 0036.

-- ---------- 1) Tipos novos ----------
alter table public.liberacao_eventos drop constraint if exists liberacao_eventos_tipo_check;
alter table public.liberacao_eventos add constraint liberacao_eventos_tipo_check
  check (tipo in ('criada', 'reprovada', 'reenviada', 'aprovada', 'email_enviado', 'comentario',
                  'alteracao_pedido'));

alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                  'liberacao_reprovada', 'liberacao_aprovada', 'liberacao_comentario',
                  'briefing_novo', 'briefing_andamento', 'briefing_concluido',
                  'visita_nova', 'visita_agendada', 'visita_realizada', 'visita_cancelada',
                  'rgb_vencendo', 'rgb_vence_hoje', 'rgb_vencida',
                  'ci_nova', 'ci_vinheta_entrou', 'ci_recusada',
                  'ci_foto_solicitada', 'ci_foto_enviada',
                  'ci_checkout_solicitada', 'ci_checkout_enviada',
                  'prazo_solicitado', 'prazo_definido',
                  'liberacao_pedido_alterado'));

-- ---------- 2) Foto do pedido (o que importa para a produção) ----------
-- security invoker: lê com as permissões de quem salva (equipe).
create or replace function public.foto_pedido(p_venda uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'status', v.status,
    'cliente', coalesce((select c.nome from public.cadastros c where c.id = v.cadastro_id), ''),
    'vendedor', coalesce(v.vendedor, ''),
    'observacao', coalesce(v.observacao, ''),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'categoria', i.categoria, 'descricao', i.descricao,
        'ponto', coalesce(i.ponto, ''), 'periodo_inicio', i.periodo_inicio,
        'periodo_fim', i.periodo_fim, 'quantidade', i.quantidade,
        'ordem_id', (select o.id from public.ordens_producao o where o.venda_item_id = i.id))
        order by i.ordem)
      from public.vendas_itens i where i.venda_id = v.id), '[]'::jsonb))
  from public.vendas v where v.id = p_venda;
$$;
revoke all on function public.foto_pedido(uuid) from public, anon;
grant execute on function public.foto_pedido(uuid) to authenticated;

-- ---------- 3) Registrar a mudança ----------
-- Chamada por salvar_venda com a foto de antes. security definer porque mexe em ordens e no
-- histórico da liberação; só cancela ordens que eram deste pedido e cujo item acabou de sair.
create or replace function public.registrar_alteracao_pedido(p_venda uuid, p_antes jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.liberacoes%rowtype;
  v_numero bigint;
  v_depois jsonb;
  a jsonb;
  d jsonb;
  o public.ordens_producao%rowtype;
  v_linhas text[] := '{}';
  v_linha text;
  v_mud text[];
  v_iniciada boolean;
  v_nome text := public.current_display_name();
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só comercial e gestão alteram propostas e pedidos' using errcode = '42501';
  end if;
  if p_antes is null then return; end if;
  select * into l from public.liberacoes where venda_id = p_venda;
  if not found then return; end if;
  select numero into v_numero from public.vendas where id = p_venda;
  v_depois := public.foto_pedido(p_venda);

  -- Cabeçalho
  if p_antes->>'status' is distinct from v_depois->>'status' then
    v_linhas := v_linhas || format('Situação do pedido: %s → %s', p_antes->>'status', v_depois->>'status');
  end if;
  if p_antes->>'cliente' is distinct from v_depois->>'cliente' then
    v_linhas := v_linhas || format('Cliente: %s → %s', p_antes->>'cliente', v_depois->>'cliente');
  end if;
  if p_antes->>'vendedor' is distinct from v_depois->>'vendedor' then
    v_linhas := v_linhas || format('Vendedor: %s → %s',
      coalesce(nullif(p_antes->>'vendedor', ''), '(nenhum)'), coalesce(nullif(v_depois->>'vendedor', ''), '(nenhum)'));
  end if;
  if p_antes->>'observacao' is distinct from v_depois->>'observacao' then
    v_linhas := v_linhas || 'Observação do pedido alterada'::text;
  end if;

  -- Itens removidos
  for a in select * from jsonb_array_elements(p_antes->'itens') loop
    continue when exists (select 1 from jsonb_array_elements(v_depois->'itens') x where x->>'id' = a->>'id');
    v_linha := 'Item removido: ' || (a->>'descricao') || coalesce(' (' || nullif(a->>'ponto', '') || ')', '');
    o := null;
    if nullif(a->>'ordem_id', '') is not null then
      select * into o from public.ordens_producao
      where id = (a->>'ordem_id')::uuid and venda_id = p_venda and liberacao_id = l.id
        and venda_item_id is null
      for update;
    end if;
    if o.id is not null and o.status not in ('Cancelada', 'Concluída') then
      v_iniciada := o.status not in ('Aguardando liberação', 'Aguardando')
        or exists (select 1 from public.ordens_producao_apontamentos ap where ap.ordem_id = o.id)
        or exists (select 1 from public.ordens_producao_etapas e where e.ordem_id = o.id and e.concluido);
      if v_iniciada then
        v_linha := v_linha || format(' — a ordem nº %s já começou e continua: confira com o comercial', o.numero);
        insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
        values (o.id, 'pedido', 'Item removido do pedido: a ordem continua; confira com o comercial');
      else
        update public.ordens_producao set status = 'Cancelada' where id = o.id;
        insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
        values (o.id, 'status', format('Item removido do pedido: situação alterada de %s para Cancelada', o.status));
        v_linha := v_linha || format(' — ordem nº %s cancelada', o.numero);
      end if;
    elsif o.id is not null then
      v_linha := v_linha || format(' — a ordem nº %s estava %s', o.numero, lower(o.status));
    end if;
    v_linhas := v_linhas || v_linha;
  end loop;

  -- Itens alterados
  for d in select * from jsonb_array_elements(v_depois->'itens') loop
    select x into a from jsonb_array_elements(p_antes->'itens') x where x->>'id' = d->>'id';
    continue when a is null;
    v_mud := '{}';
    if a->>'descricao' is distinct from d->>'descricao' then
      v_mud := v_mud || format('descrição "%s" → "%s"', a->>'descricao', d->>'descricao');
    end if;
    if a->>'categoria' is distinct from d->>'categoria' then
      v_mud := v_mud || format('categoria %s → %s', a->>'categoria', d->>'categoria');
    end if;
    if a->>'ponto' is distinct from d->>'ponto' then
      v_mud := v_mud || format('ponto %s → %s', coalesce(nullif(a->>'ponto', ''), '(nenhum)'), coalesce(nullif(d->>'ponto', ''), '(nenhum)'));
    end if;
    if (a->>'quantidade')::numeric is distinct from (d->>'quantidade')::numeric then
      v_mud := v_mud || format('quantidade %s → %s', trim_scale((a->>'quantidade')::numeric), trim_scale((d->>'quantidade')::numeric));
    end if;
    if a->>'periodo_inicio' is distinct from d->>'periodo_inicio' or a->>'periodo_fim' is distinct from d->>'periodo_fim' then
      v_mud := v_mud || format('período %s a %s → %s a %s',
        coalesce(to_char((a->>'periodo_inicio')::date, 'DD/MM/YYYY'), '?'), coalesce(to_char((a->>'periodo_fim')::date, 'DD/MM/YYYY'), '?'),
        coalesce(to_char((d->>'periodo_inicio')::date, 'DD/MM/YYYY'), '?'), coalesce(to_char((d->>'periodo_fim')::date, 'DD/MM/YYYY'), '?'));
    end if;
    continue when cardinality(v_mud) = 0;
    v_linha := 'Item alterado: ' || (d->>'descricao') || ': ' || array_to_string(v_mud, '; ');
    if nullif(d->>'ordem_id', '') is not null then
      insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
      values ((d->>'ordem_id')::uuid, 'pedido', 'Item do pedido alterado: ' || array_to_string(v_mud, '; '));
      v_linha := v_linha || format(' — confira a ordem nº %s', (select numero from public.ordens_producao where id = (d->>'ordem_id')::uuid));
    end if;
    v_linhas := v_linhas || v_linha;
  end loop;

  -- Itens novos: ganham ordem
  perform public.gerar_ordens_liberacao(l.id);
  for d in select * from jsonb_array_elements(v_depois->'itens') loop
    continue when exists (select 1 from jsonb_array_elements(p_antes->'itens') x where x->>'id' = d->>'id');
    v_linhas := v_linhas || ('Item novo: ' || (d->>'descricao') || coalesce(' (' || nullif(d->>'ponto', '') || ')', '')
      || coalesce(format(' — ordem nº %s criada', (select numero from public.ordens_producao where venda_item_id = (d->>'id')::uuid)), ''));
  end loop;

  if cardinality(v_linhas) = 0 then return; end if;

  insert into public.liberacao_eventos (liberacao_id, tipo, detalhe, autor, autor_nome)
  values (l.id, 'alteracao_pedido',
    format('Pedido %s alterado:', v_numero) || E'\n• ' || array_to_string(v_linhas, E'\n• '),
    auth.uid(), v_nome);

  insert into public.notifications
    (recipient_id, tipo, liberacao_id, liberacao_numero, actor_name, project_name, detalhe, link, ref_numero)
  select distinct dst, 'liberacao_pedido_alterado', l.id, l.numero, v_nome, l.cliente,
         left(array_to_string(v_linhas, ' · '), 200), '/liberacoes/' || l.id, l.numero
  from unnest(public.pessoas_com_funcao(array['pcp', 'direcao'])) as dst
  where dst is not null and dst is distinct from auth.uid();
end;
$$;
revoke all on function public.registrar_alteracao_pedido(uuid, jsonb) from public, anon;
grant execute on function public.registrar_alteracao_pedido(uuid, jsonb) to authenticated;

-- ---------- 4) salvar_venda: foto antes, registro depois ----------
create or replace function public.salvar_venda(dados jsonb, venda_uuid uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_tipo text;
  item jsonb;
  i integer := 0;
  v_item uuid;
  v_mantidos uuid[] := '{}';
  v_antes jsonb;
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só comercial e gestão alteram propostas e pedidos' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(dados->'itens', '[]'::jsonb)) = 0 then
    raise exception 'Inclua pelo menos um item';
  end if;
  if venda_uuid is null then
    insert into public.vendas (tipo, empresa_id, cadastro_id, vendedor, status, validade,
      condicoes_pagamento, observacao, desconto)
    values (dados->>'tipo', (dados->>'empresa_id')::uuid, (dados->>'cadastro_id')::uuid,
      nullif(btrim(dados->>'vendedor'), ''), dados->>'status', nullif(dados->>'validade', '')::date,
      nullif(btrim(dados->>'condicoes_pagamento'), ''), nullif(btrim(dados->>'observacao'), ''),
      coalesce((dados->>'desconto')::numeric, 0))
    returning id into v_id;
  else
    select tipo into v_tipo from public.vendas where id = venda_uuid for update;
    if not found then raise exception 'Documento não encontrado'; end if;
    -- Só pedidos com liberação são comparados (o resto não precisa da foto).
    if exists (select 1 from public.liberacoes where venda_id = venda_uuid) then
      v_antes := public.foto_pedido(venda_uuid);
    end if;
    update public.vendas set
      empresa_id = (dados->>'empresa_id')::uuid,
      cadastro_id = (dados->>'cadastro_id')::uuid,
      vendedor = nullif(btrim(dados->>'vendedor'), ''),
      status = dados->>'status',
      validade = case when v_tipo = 'proposta' then nullif(dados->>'validade', '')::date end,
      condicoes_pagamento = nullif(btrim(dados->>'condicoes_pagamento'), ''),
      observacao = nullif(btrim(dados->>'observacao'), ''),
      desconto = coalesce((dados->>'desconto')::numeric, 0)
    where id = venda_uuid
    returning id into v_id;

    -- Ids enviados que são itens deste documento (cada um conta uma vez).
    select coalesce(array_agg(distinct vi.id), '{}') into v_mantidos
      from jsonb_array_elements(dados->'itens') e
      join public.vendas_itens vi
        on vi.venda_id = v_id
       and vi.id::text = nullif(e->>'id', '');
    delete from public.vendas_itens where venda_id = v_id and not (id = any (v_mantidos));
  end if;

  for item in select * from jsonb_array_elements(dados->'itens') loop
    i := i + 1;
    if coalesce(btrim(item->>'descricao'), '') = '' then
      raise exception 'Item % sem descrição', i;
    end if;
    v_item := null;
    if (nullif(item->>'id', '') is not null) and (item->>'id')::text = any (v_mantidos::text[]) then
      v_item := (item->>'id')::uuid;
      v_mantidos := array_remove(v_mantidos, v_item);  -- um id repetido vira item novo
    end if;
    if v_item is not null then
      update public.vendas_itens set
        ordem = i,
        categoria = item->>'categoria',
        descricao = btrim(item->>'descricao'),
        ponto = nullif(btrim(item->>'ponto'), ''),
        periodo_inicio = nullif(item->>'periodo_inicio', '')::date,
        periodo_fim = nullif(item->>'periodo_fim', '')::date,
        quantidade = coalesce((item->>'quantidade')::numeric, 1),
        valor_unitario = coalesce((item->>'valor_unitario')::numeric, 0),
        desconto = coalesce((item->>'desconto')::numeric, 0)
      where id = v_item;
    else
      insert into public.vendas_itens (venda_id, ordem, categoria, descricao, ponto, periodo_inicio,
        periodo_fim, quantidade, valor_unitario, desconto)
      values (v_id, i, item->>'categoria', btrim(item->>'descricao'), nullif(btrim(item->>'ponto'), ''),
        nullif(item->>'periodo_inicio', '')::date, nullif(item->>'periodo_fim', '')::date,
        coalesce((item->>'quantidade')::numeric, 1), coalesce((item->>'valor_unitario')::numeric, 0),
        coalesce((item->>'desconto')::numeric, 0));
    end if;
  end loop;

  if v_antes is not null then
    perform public.registrar_alteracao_pedido(v_id, v_antes);
  end if;
  return v_id;
end;
$$;
revoke all on function public.salvar_venda(jsonb, uuid) from public, anon;
grant execute on function public.salvar_venda(jsonb, uuid) to authenticated;
