-- Orçamento de Projetos Especiais (docs/estoque-plano.md, a partir do "modelo orçamento" da Patty):
-- composição de custo dentro de cada item da proposta/pedido.
--   * Materiais por seção (Painel, Estrutura, Letreiro, Pintura, Iluminação, Outros): produto do
--     estoque + quantidade + valor unitário (vem do custo do produto e pode ser mudado). É a
--     mesma lista de material da 0048: entra na previsão do estoque. O mesmo produto pode estar
--     em mais de uma seção (a previsão soma as seções).
--   * Outros custos (não são estoque): mão de obra por setor (R$/hora × horas), deslocamento
--     (R$/km × km) e serviços (corte router, corte laser…), do catálogo orcamento_custos, ou uma
--     linha livre.
--   * Preço = custo ÷ fator (venda 0,55; com desconto 0,59; sem nota 0,62); entrada = 50% do preço
--     de venda. Fatores, % de entrada e o catálogo ficam em tabelas que a Gestão/Direção edita.
--   * "Usar no item" grava o preço escolhido no valor unitário do item (÷ quantidade do item).
-- Quem monta a composição: Projetos Especiais, Estoque, Gestão e Direção (pode_listar_material).
-- Quem vê valores: pode_ver_custo passa a incluir Projetos Especiais e Comercial (quem orça
-- precisa do custo); a produção continua sem ver valores.
-- Depende de 0046–0049. Pode rodar mais de uma vez.

-- ---------- 1) Quem vê custo ----------
create or replace function estoque.pode_ver_custo(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id,
    array['gestor', 'direcao', 'estoque', 'financeiro', 'projetos_especiais', 'comercial'])
$$;

-- ---------- 2) Configuração e catálogo de custos ----------
create table if not exists public.orcamento_config (
  id boolean primary key default true check (id),
  fator_venda numeric(6,4) not null default 0.55 check (fator_venda > 0 and fator_venda <= 1),
  fator_desconto numeric(6,4) not null default 0.59 check (fator_desconto > 0 and fator_desconto <= 1),
  fator_sem_nota numeric(6,4) not null default 0.62 check (fator_sem_nota > 0 and fator_sem_nota <= 1),
  entrada_pct numeric(5,2) not null default 50 check (entrada_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.orcamento_config (id) values (true) on conflict (id) do nothing;

create table if not exists public.orcamento_custos (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('Mão de obra', 'Deslocamento', 'Serviço')),
  nome text not null check (length(btrim(nome)) > 0),
  unidade text not null default 'h' check (length(btrim(unidade)) > 0),
  valor numeric(14,4) not null default 0 check (valor >= 0),
  dica text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists orcamento_custos_nome_unico
  on public.orcamento_custos (grupo, lower(btrim(nome)));

insert into public.orcamento_custos (grupo, nome, unidade, valor, dica, ordem) values
  ('Mão de obra', 'Produção de lona, adesivo e papel', 'h', 179.71, 'Tempo de impressão', 1),
  ('Mão de obra', 'Produção - acabamento de materiais', 'h', 359.42, 'Tempo de acabamento', 2),
  ('Mão de obra', 'Produção letras - montagem e acabamento', 'h', 270.82, 'Tempo para montagem e acabamento', 3),
  ('Mão de obra', 'Produção letras - pintura', 'h', 135.41, 'Tempo para pintura', 4),
  ('Mão de obra', 'Produção letras - elétrica', 'h', 135.41, 'Tempo para instalação de LEDs', 5),
  ('Mão de obra', 'Serralheria', 'h', 260.08, 'Soldagem de quadros', 6),
  ('Mão de obra', 'Projetos especiais', 'h', 269.00, 'Corte de ACM e montagem de materiais internos', 7),
  ('Mão de obra', 'Orçamentos', 'h', 305.52, 'Tempo para orçar', 8),
  ('Mão de obra', 'Criação', 'h', 159.83, 'Tempo para liberar um arquivo de impressão', 9),
  ('Mão de obra', 'Equipe de instalação de projetos', 'h', 539.11, 'Tempo para instalar o serviço no local', 10),
  ('Mão de obra', 'Administrativo', 'h', 190.86, null, 11),
  ('Mão de obra', 'Comercial', 'h', 184.64, null, 12),
  ('Deslocamento', 'Deslocamento caminhão', 'km', 8.00, 'Distância em km', 1),
  ('Deslocamento', 'Deslocamento carro', 'km', 7.00, 'Distância em km', 2),
  ('Serviço', 'Corte router', 'm', 4.50, null, 1),
  ('Serviço', 'Corte router - chapa galvanizada', 'm', 6.00, null, 2),
  ('Serviço', 'Corte laser', 'm', 4.00, null, 3),
  ('Serviço', 'Gravação laser', 'm²', 0, null, 4),
  ('Serviço', 'Frete', 'un', 0, null, 5)
on conflict do nothing;

alter table public.orcamento_config enable row level security;
alter table public.orcamento_custos enable row level security;
revoke all on public.orcamento_config, public.orcamento_custos from public, anon;
grant select, update on public.orcamento_config to authenticated;
grant select, insert, update, delete on public.orcamento_custos to authenticated;
grant all on public.orcamento_config, public.orcamento_custos to service_role;

drop policy if exists orcamento_config_select on public.orcamento_config;
drop policy if exists orcamento_config_update on public.orcamento_config;
create policy orcamento_config_select on public.orcamento_config for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy orcamento_config_update on public.orcamento_config for update to authenticated
  using (public.has_any_role(auth.uid(), array['gestor', 'direcao']))
  with check (public.has_any_role(auth.uid(), array['gestor', 'direcao']));

drop policy if exists orcamento_custos_select on public.orcamento_custos;
drop policy if exists orcamento_custos_insert on public.orcamento_custos;
drop policy if exists orcamento_custos_update on public.orcamento_custos;
drop policy if exists orcamento_custos_delete on public.orcamento_custos;
create policy orcamento_custos_select on public.orcamento_custos for select to authenticated
  using (estoque.pode_ver_custo(auth.uid()));
create policy orcamento_custos_insert on public.orcamento_custos for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['gestor', 'direcao']));
create policy orcamento_custos_update on public.orcamento_custos for update to authenticated
  using (public.has_any_role(auth.uid(), array['gestor', 'direcao']))
  with check (public.has_any_role(auth.uid(), array['gestor', 'direcao']));
create policy orcamento_custos_delete on public.orcamento_custos for delete to authenticated
  using (public.has_any_role(auth.uid(), array['gestor', 'direcao']));

drop trigger if exists orcamento_custos_touch on public.orcamento_custos;
create trigger orcamento_custos_touch before update on public.orcamento_custos
  for each row execute function public.touch_updated_at();
drop trigger if exists orcamento_config_touch on public.orcamento_config;
create trigger orcamento_config_touch before update on public.orcamento_config
  for each row execute function public.touch_updated_at();

-- ---------- 3) Materiais: seção e valor; o mesmo produto em mais de uma seção ----------
alter table estoque.materiais_item
  add column if not exists secao text not null default '',
  add column if not exists valor_unitario numeric(14,4) check (valor_unitario >= 0),
  add column if not exists ordem integer not null default 0;
alter table estoque.materiais_item
  drop constraint if exists materiais_item_venda_item_id_produto_id_key;
create unique index if not exists materiais_item_secao_unico
  on estoque.materiais_item (venda_item_id, produto_id, secao);

-- Outros custos de cada item (mão de obra, deslocamento, serviço ou linha livre).
create table if not exists public.vendas_itens_custos (
  id uuid primary key default gen_random_uuid(),
  venda_item_id uuid not null references public.vendas_itens (id) on delete cascade,
  custo_id uuid references public.orcamento_custos (id) on delete set null,
  secao text not null default '',
  descricao text not null check (length(btrim(descricao)) > 0),
  unidade text not null default 'un',
  quantidade numeric(14,3) not null check (quantidade > 0),
  valor_unitario numeric(14,4) not null default 0 check (valor_unitario >= 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists vendas_itens_custos_item_idx on public.vendas_itens_custos (venda_item_id, ordem);
alter table public.vendas_itens_custos enable row level security;
revoke all on public.vendas_itens_custos from public, anon;
grant select on public.vendas_itens_custos to authenticated;
grant all on public.vendas_itens_custos to service_role;
drop policy if exists vendas_itens_custos_select on public.vendas_itens_custos;
create policy vendas_itens_custos_select on public.vendas_itens_custos for select to authenticated
  using (estoque.pode_ver_custo(auth.uid()));

-- ---------- 4) Leitura da lista: baixado/pendente por item + produto (somando as seções) ----------
-- create or replace: as colunas da 0048 ficam iguais e na mesma ordem; as novas vão no fim.
create or replace view estoque.v_materiais_item as
with base as (
  select mi.*, sum(mi.quantidade) over (partition by mi.venda_item_id, mi.produto_id) as total_produto
  from estoque.materiais_item mi
)
select mi.id, mi.venda_item_id, vi.venda_id, v.tipo as venda_tipo, v.numero as venda_numero,
  v.status as venda_status, v.cadastro_id as cliente_id, c.nome as cliente,
  vi.ordem as item_ordem, vi.descricao as item_descricao,
  o.id as ordem_id, o.numero as ordem_numero, o.status as ordem_status,
  mi.produto_id, p.codigo, p.nome as produto, p.unidade, mi.quantidade,
  coalesce(bx.baixado, 0)::numeric(14,3) as baixado,
  greatest(mi.total_produto - coalesce(bx.baixado, 0), 0)::numeric(14,3) as pendente,
  (
    ((v.tipo = 'pedido' and v.status in ('Aberto', 'Em andamento'))
      or (v.tipo = 'proposta' and v.status = 'Aprovada'
        and not exists (select 1 from public.vendas pd where pd.proposta_id = v.id)))
    and coalesce(o.status, '') not in ('Concluída', 'Cancelada')
  ) as conta_na_previsao,
  mi.observacao, mi.atualizado_por_nome, mi.updated_at,
  mi.secao,
  case when estoque.pode_ver_custo(auth.uid()) then mi.valor_unitario end as valor_unitario,
  mi.total_produto::numeric(14,3) as quantidade_total,
  mi.ordem
from base mi
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

-- Uma linha por item + produto (as seções somadas), só o que conta e está pendente.
create or replace view estoque.v_demanda as
select distinct on (venda_item_id, produto_id)
  id, venda_item_id, venda_id, venda_tipo, venda_numero, venda_status, cliente_id, cliente,
  item_ordem, item_descricao, ordem_id, ordem_numero, ordem_status, produto_id, codigo, produto,
  unidade, quantidade_total as quantidade, baixado, pendente, conta_na_previsao, observacao,
  atualizado_por_nome, updated_at
from estoque.v_materiais_item
where conta_na_previsao and pendente > 0
order by venda_item_id, produto_id, id;

-- ---------- 5) Escrita ----------
-- A lista simples da 0048 continua funcionando (linhas sem seção).
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
    and (mi.secao <> '' or not exists (select 1 from l where l.produto_id = mi.produto_id));

  insert into estoque.materiais_item as mi (venda_item_id, produto_id, secao, quantidade,
    observacao, atualizado_por_nome)
  select _venda_item, (x->>'produto_id')::uuid, '', sum((x->>'quantidade')::numeric),
    nullif(string_agg(nullif(btrim(x->>'observacao'), ''), '; '), ''), v_nome
  from jsonb_array_elements(coalesce(_linhas, '[]')) x
  group by (x->>'produto_id')::uuid
  on conflict (venda_item_id, produto_id, secao) do update set
    quantidade = excluded.quantidade, observacao = excluded.observacao,
    atualizado_por_nome = excluded.atualizado_por_nome, updated_at = now()
  where (mi.quantidade, coalesce(mi.observacao, ''))
    is distinct from (excluded.quantidade, coalesce(excluded.observacao, ''));
  select count(*) into v_n from estoque.materiais_item where venda_item_id = _venda_item;
  return v_n;
end $$;

-- Troca a composição inteira de um item:
--   _dados = {materiais: [{produto_id, secao, quantidade, valor_unitario?, observacao?}],
--             custos:    [{custo_id?, secao?, descricao, unidade, quantidade, valor_unitario}]}
-- O mesmo produto na mesma seção soma. Devolve {materiais, custos} (quantas linhas ficaram).
create or replace function estoque.salvar_composicao(_venda_item uuid, _dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_mat jsonb := coalesce(_dados->'materiais', '[]');
  v_cus jsonb := coalesce(_dados->'custos', '[]');
  v_nm integer; v_nc integer;
begin
  if not estoque.pode_listar_material(auth.uid()) then
    raise exception 'Somente Projetos, Estoque, Gestão e Direção montam a composição.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendas_itens where id = _venda_item) then
    raise exception 'Item não encontrado. Salve o documento antes de montar a composição.'
      using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(v_mat) l
    where not exists (select 1 from estoque.produtos p where p.id = nullif(l->>'produto_id', '')::uuid)) then
    raise exception 'Escolha o material em todas as linhas.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_mat || v_cus) l
    where coalesce(nullif(l->>'quantidade', '')::numeric, 0) <= 0) then
    raise exception 'Informe a quantidade de cada linha.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_mat || v_cus) l
    where coalesce(nullif(l->>'valor_unitario', '')::numeric, 0) < 0) then
    raise exception 'O valor não pode ser negativo.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_cus) l where coalesce(btrim(l->>'descricao'), '') = '') then
    raise exception 'Escreva a descrição de cada custo.' using errcode = '22023';
  end if;
  select display_name into v_nome from public.profiles where id = auth.uid();

  delete from estoque.materiais_item where venda_item_id = _venda_item;
  insert into estoque.materiais_item (venda_item_id, produto_id, secao, quantidade, valor_unitario,
    observacao, ordem, atualizado_por_nome)
  select _venda_item, (x->>'produto_id')::uuid, coalesce(btrim(x->>'secao'), ''),
    sum((x->>'quantidade')::numeric), max(nullif(x->>'valor_unitario', '')::numeric),
    nullif(string_agg(nullif(btrim(x->>'observacao'), ''), '; '), ''), min(n)::integer, v_nome
  from jsonb_array_elements(v_mat) with ordinality t(x, n)
  group by (x->>'produto_id')::uuid, coalesce(btrim(x->>'secao'), '');
  get diagnostics v_nm = row_count;

  delete from public.vendas_itens_custos where venda_item_id = _venda_item;
  insert into public.vendas_itens_custos (venda_item_id, custo_id, secao, descricao, unidade,
    quantidade, valor_unitario, ordem)
  select _venda_item,
    (select c.id from public.orcamento_custos c where c.id = nullif(x->>'custo_id', '')::uuid),
    coalesce(btrim(x->>'secao'), ''), btrim(x->>'descricao'),
    coalesce(nullif(btrim(x->>'unidade'), ''), 'un'), (x->>'quantidade')::numeric,
    coalesce(nullif(x->>'valor_unitario', '')::numeric, 0), n::integer
  from jsonb_array_elements(v_cus) with ordinality t(x, n);
  get diagnostics v_nc = row_count;
  return jsonb_build_object('materiais', v_nm, 'custos', v_nc);
end $$;

-- Grava o preço escolhido no item (valor total ÷ quantidade do item).
create or replace function estoque.aplicar_preco_item(_venda_item uuid, _valor_total numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qtd numeric; v_venda uuid; v_unit numeric;
begin
  if not (estoque.pode_listar_material(auth.uid()) or public.can_vender(auth.uid())) then
    raise exception 'Sem permissão para mudar o valor do item.' using errcode = '42501';
  end if;
  if _valor_total is null or _valor_total < 0 then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;
  select quantidade, venda_id into v_qtd, v_venda from public.vendas_itens where id = _venda_item for update;
  if not found then raise exception 'Item não encontrado.' using errcode = 'P0002'; end if;
  v_unit := round(_valor_total / v_qtd, 2);
  update public.vendas_itens set valor_unitario = v_unit where id = _venda_item;
  update public.vendas set updated_at = now() where id = v_venda;
  return v_unit;
end $$;

-- Proposta → pedido: leva materiais (com seção e valor) e os outros custos.
create or replace function estoque.copiar_lista_proposta(_pedido uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not (public.can_vender(auth.uid()) or estoque.pode_listar_material(auth.uid())) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into estoque.materiais_item (venda_item_id, produto_id, secao, quantidade, valor_unitario,
    observacao, ordem, atualizado_por_nome)
  select pi.id, m.produto_id, m.secao, m.quantidade, m.valor_unitario, m.observacao, m.ordem,
    m.atualizado_por_nome
  from public.vendas pd
  join public.vendas_itens pi on pi.venda_id = pd.id
  join public.vendas_itens qi on qi.venda_id = pd.proposta_id and qi.ordem = pi.ordem
  join estoque.materiais_item m on m.venda_item_id = qi.id
  where pd.id = _pedido and pd.proposta_id is not null
    and not exists (select 1 from estoque.materiais_item x where x.venda_item_id = pi.id)
  on conflict (venda_item_id, produto_id, secao) do nothing;
  get diagnostics v_n = row_count;
  insert into public.vendas_itens_custos (venda_item_id, custo_id, secao, descricao, unidade,
    quantidade, valor_unitario, ordem)
  select pi.id, c.custo_id, c.secao, c.descricao, c.unidade, c.quantidade, c.valor_unitario, c.ordem
  from public.vendas pd
  join public.vendas_itens pi on pi.venda_id = pd.id
  join public.vendas_itens qi on qi.venda_id = pd.proposta_id and qi.ordem = pi.ordem
  join public.vendas_itens_custos c on c.venda_item_id = qi.id
  where pd.id = _pedido and pd.proposta_id is not null
    and not exists (select 1 from public.vendas_itens_custos x where x.venda_item_id = pi.id);
  return v_n;
end $$;

revoke execute on function estoque.salvar_composicao(uuid, jsonb) from public, anon;
revoke execute on function estoque.aplicar_preco_item(uuid, numeric) from public, anon;
grant execute on function estoque.salvar_composicao(uuid, jsonb) to authenticated, service_role;
grant execute on function estoque.aplicar_preco_item(uuid, numeric) to authenticated, service_role;
grant execute on function estoque.salvar_lista_material(uuid, jsonb) to authenticated, service_role;
grant execute on function estoque.copiar_lista_proposta(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
