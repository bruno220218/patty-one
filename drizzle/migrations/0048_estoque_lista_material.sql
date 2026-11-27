-- Estoque, etapa 3 (docs/estoque-plano.md): lista de material do orçamento, previsão e lista de
-- compras.
--   * Cada item de proposta/pedido (vendas_itens) ganha uma lista de material: produto do estoque
--     + quantidade. Quem monta: Projetos Especiais, Estoque, Gestão e Direção. Toda a equipe vê.
--   * A lista fica no item; a ordem de produção do item (ordens_producao.venda_item_id) usa a
--     mesma lista, sem cópia. Ao gerar o pedido de uma proposta, a lista dos itens é copiada
--     para os itens do pedido (converter_proposta passa a fazer isso).
--   * Previsão ("triangulação"): saldo atual − o que ainda falta tirar para os serviços abertos.
--     Conta só o que foi aprovado: pedido Aberto/Em andamento e proposta Aprovada que ainda não
--     virou pedido. Item com ordem Concluída ou Cancelada sai da conta. Do pedido, desconta o que
--     já foi baixado para a ordem do item (baixas − devoluções). NÃO dá baixa em nada.
--   * Lista de compras = produtos que ficam negativos na previsão (a tela baixa em CSV).
-- Depende de 0020 (vendas), 0034 (item com id fixo), 0036 (ordem por item) e 0046/0047 (estoque).
-- Pode rodar mais de uma vez.

-- ---------- 1) Permissão ----------
create or replace function estoque.pode_listar_material(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'direcao', 'estoque', 'projetos_especiais'])
$$;
revoke execute on function estoque.pode_listar_material(uuid) from public, anon;
grant execute on function estoque.pode_listar_material(uuid) to authenticated, service_role;

-- ---------- 2) Lista de material por item ----------
create table if not exists estoque.materiais_item (
  id uuid primary key default gen_random_uuid(),
  venda_item_id uuid not null references public.vendas_itens (id) on delete cascade,
  produto_id uuid not null references estoque.produtos (id),
  quantidade numeric(14,3) not null check (quantidade > 0),
  observacao text,
  atualizado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venda_item_id, produto_id)
);
create index if not exists materiais_item_produto_idx on estoque.materiais_item (produto_id);

alter table estoque.materiais_item enable row level security;
revoke all on estoque.materiais_item from public, anon, authenticated;
grant all on estoque.materiais_item to service_role;

-- ---------- 3) Leitura ----------
drop view if exists estoque.v_previsao;
drop view if exists estoque.v_demanda;
drop view if exists estoque.v_materiais_item;

-- Cada linha de lista, com o que já foi baixado para a ordem do item e se ainda conta na previsão.
create view estoque.v_materiais_item as
select mi.id, mi.venda_item_id, vi.venda_id, v.tipo as venda_tipo, v.numero as venda_numero,
  v.status as venda_status, v.cadastro_id as cliente_id, c.nome as cliente,
  vi.ordem as item_ordem, vi.descricao as item_descricao,
  o.id as ordem_id, o.numero as ordem_numero, o.status as ordem_status,
  mi.produto_id, p.codigo, p.nome as produto, p.unidade, mi.quantidade,
  coalesce(bx.baixado, 0)::numeric(14,3) as baixado,
  greatest(mi.quantidade - coalesce(bx.baixado, 0), 0)::numeric(14,3) as pendente,
  (
    ((v.tipo = 'pedido' and v.status in ('Aberto', 'Em andamento'))
      or (v.tipo = 'proposta' and v.status = 'Aprovada'
        and not exists (select 1 from public.vendas pd where pd.proposta_id = v.id)))
    and coalesce(o.status, '') not in ('Concluída', 'Cancelada')
  ) as conta_na_previsao,
  mi.observacao, mi.atualizado_por_nome, mi.updated_at
from estoque.materiais_item mi
join public.vendas_itens vi on vi.id = mi.venda_item_id
join public.vendas v on v.id = vi.venda_id
join estoque.produtos p on p.id = mi.produto_id
left join public.cadastros c on c.id = v.cadastro_id
left join public.ordens_producao o on o.venda_item_id = vi.id
left join lateral (
  select sum(case m.tipo when 'Baixa' then m.quantidade when 'Devolução' then -m.quantidade end)
    as baixado
  from estoque.movimentos m
  where o.id is not null and m.ordem_id = o.id and m.produto_id = mi.produto_id
    and m.tipo in ('Baixa', 'Devolução')
) bx on true
where public.is_team_member(auth.uid());

-- O que cada serviço aberto ainda vai tirar do estoque (só o que conta e está pendente).
create view estoque.v_demanda as
select * from estoque.v_materiais_item where conta_na_previsao and pendente > 0;

-- Por produto: saldo, reservado para os serviços abertos, previsão e o que falta comprar.
create view estoque.v_previsao as
select p.id, p.codigo, p.setor, p.setor_nome, p.nome, p.unidade, p.estoque_minimo, p.ativo,
  p.fornecedor_id, p.fornecedor, p.custo as ultimo_valor, p.ultima_entrada, p.ultimo_lote,
  p.quantidade as saldo,
  coalesce(d.reservado, 0)::numeric(14,3) as reservado,
  (p.quantidade - coalesce(d.reservado, 0))::numeric(14,3) as previsto,
  greatest(coalesce(d.reservado, 0) - p.quantidade, 0)::numeric(14,3) as falta,
  greatest(coalesce(d.reservado, 0) + coalesce(p.estoque_minimo, 0) - p.quantidade, 0)::numeric(14,3)
    as falta_com_minimo,
  coalesce(d.servicos, 0)::integer as servicos
from estoque.v_produtos p
left join (
  select produto_id, sum(pendente) as reservado, count(distinct venda_item_id) as servicos
  from estoque.v_demanda group by produto_id
) d on d.produto_id = p.id;

revoke all on estoque.v_materiais_item, estoque.v_demanda, estoque.v_previsao from public, anon;
grant select on estoque.v_materiais_item, estoque.v_demanda, estoque.v_previsao
  to authenticated, service_role;

-- ---------- 4) Escrita ----------
-- Troca a lista inteira de um item: _linhas = [{produto_id, quantidade, observacao?}]. Produto
-- repetido soma. Lista vazia apaga. Devolve quantas linhas ficaram.
create or replace function estoque.salvar_lista_material(_venda_item uuid, _linhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_n integer;
begin
  if not estoque.pode_listar_material(auth.uid()) then
    raise exception 'Somente Projetos, Estoque, Gestão e Direção montam a lista de material.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendas_itens where id = _venda_item) then
    raise exception 'Item não encontrado. Salve o documento antes de montar a lista.'
      using errcode = 'P0002';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(_linhas, '[]')) l
    where not exists (select 1 from estoque.produtos p where p.id = nullif(l->>'produto_id', '')::uuid)
  ) then
    raise exception 'Escolha o produto em todas as linhas.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(_linhas, '[]')) l
    where coalesce(nullif(l->>'quantidade', '')::numeric, 0) <= 0
  ) then
    raise exception 'Informe a quantidade de cada material.' using errcode = '22023';
  end if;
  select display_name into v_nome from public.profiles where id = auth.uid();

  with l as (
    select (x->>'produto_id')::uuid as produto_id
    from jsonb_array_elements(coalesce(_linhas, '[]')) x
  )
  delete from estoque.materiais_item mi
  where mi.venda_item_id = _venda_item
    and not exists (select 1 from l where l.produto_id = mi.produto_id);

  insert into estoque.materiais_item as mi (venda_item_id, produto_id, quantidade, observacao,
    atualizado_por_nome)
  select _venda_item, (x->>'produto_id')::uuid, sum((x->>'quantidade')::numeric),
    nullif(string_agg(nullif(btrim(x->>'observacao'), ''), '; '), ''), v_nome
  from jsonb_array_elements(coalesce(_linhas, '[]')) x
  group by (x->>'produto_id')::uuid
  on conflict (venda_item_id, produto_id) do update set
    quantidade = excluded.quantidade, observacao = excluded.observacao,
    atualizado_por_nome = excluded.atualizado_por_nome, updated_at = now()
  where (mi.quantidade, coalesce(mi.observacao, ''))
    is distinct from (excluded.quantidade, coalesce(excluded.observacao, ''));
  select count(*) into v_n from estoque.materiais_item where venda_item_id = _venda_item;
  return v_n;
end $$;

-- Copia a lista dos itens da proposta para os itens do pedido (par pela posição do item).
-- Chamada por converter_proposta; não mexe em item do pedido que já tem lista.
create or replace function estoque.copiar_lista_proposta(_pedido uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not (public.can_vender(auth.uid()) or estoque.pode_listar_material(auth.uid())) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into estoque.materiais_item (venda_item_id, produto_id, quantidade, observacao,
    atualizado_por_nome)
  select pi.id, m.produto_id, m.quantidade, m.observacao, m.atualizado_por_nome
  from public.vendas pd
  join public.vendas_itens pi on pi.venda_id = pd.id
  join public.vendas_itens qi on qi.venda_id = pd.proposta_id and qi.ordem = pi.ordem
  join estoque.materiais_item m on m.venda_item_id = qi.id
  where pd.id = _pedido and pd.proposta_id is not null
    and not exists (select 1 from estoque.materiais_item x where x.venda_item_id = pi.id)
  on conflict (venda_item_id, produto_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Produto que está em alguma lista de material também não pode ser excluído.
create or replace function estoque.excluir_produto(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform estoque.exigir_movimentar();
  if exists (select 1 from estoque.movimentos where produto_id = _id) then
    raise exception 'Este produto já tem movimentos. Desative em vez de excluir.' using errcode = '23503';
  end if;
  if exists (select 1 from estoque.materiais_item where produto_id = _id) then
    raise exception 'Este produto está na lista de material de um orçamento. Desative em vez de excluir.'
      using errcode = '23503';
  end if;
  delete from estoque.produtos where id = _id;
end $$;

revoke execute on function estoque.salvar_lista_material(uuid, jsonb) from public, anon;
revoke execute on function estoque.copiar_lista_proposta(uuid) from public, anon;
grant execute on function estoque.salvar_lista_material(uuid, jsonb) to authenticated, service_role;
grant execute on function estoque.copiar_lista_proposta(uuid) to authenticated, service_role;
grant execute on function estoque.excluir_produto(uuid) to authenticated, service_role;

-- ---------- 5) Proposta → pedido também leva a lista de material ----------
-- Igual à da 0020, mais a cópia da lista no fim.
create or replace function public.converter_proposta(proposta_uuid uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  p public.vendas;
  novo uuid;
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só comercial e gestão geram pedidos' using errcode = '42501';
  end if;
  select * into p from public.vendas where id = proposta_uuid and tipo = 'proposta' for update;
  if p.id is null then raise exception 'Proposta não encontrada'; end if;
  if p.status = 'Recusada' then raise exception 'Proposta recusada não pode virar pedido'; end if;
  if exists (select 1 from public.vendas where proposta_id = p.id) then
    raise exception 'Esta proposta já gerou um pedido';
  end if;
  insert into public.vendas (tipo, empresa_id, cadastro_id, vendedor, status, condicoes_pagamento,
    observacao, desconto, proposta_id)
  values ('pedido', p.empresa_id, p.cadastro_id, p.vendedor, 'Aberto', p.condicoes_pagamento,
    p.observacao, p.desconto, p.id)
  returning id into novo;
  insert into public.vendas_itens (venda_id, ordem, categoria, descricao, ponto, periodo_inicio,
    periodo_fim, quantidade, valor_unitario, desconto)
  select novo, ordem, categoria, descricao, ponto, periodo_inicio, periodo_fim, quantidade,
    valor_unitario, desconto
  from public.vendas_itens where venda_id = p.id;
  update public.vendas set status = 'Aprovada' where id = p.id;
  perform estoque.copiar_lista_proposta(novo);
  return novo;
end;
$$;
revoke all on function public.converter_proposta(uuid) from public, anon;
grant execute on function public.converter_proposta(uuid) to authenticated;

notify pgrst, 'reload schema';
