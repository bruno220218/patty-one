-- ============ Estoque, etapa 2: XML da NF-e + similares (plano em docs/estoque-plano.md) ============
-- Cada fornecedor escreve o mesmo material de um jeito ("COLA SUPER CIANO", "COLA RAPIDA"…).
-- Um "similar" liga esse nome (e o código do fornecedor) a um produto do estoque, como um branch:
--
--   estoque.similares  produto ← nome/código de um fornecedor (CNPJ) ou nome geral (sem CNPJ),
--                      com o fator de conversão (ex.: 1 caixa da nota = 12 un no estoque)
--   estoque.notas      cada NF-e importada (chave de acesso única: a mesma nota não entra 2 vezes)
--   movimentos.nota_id a entrada aponta a nota de onde veio
--
-- Fluxo: o app lê o XML no navegador → identificar_itens_nota sugere o produto de cada item
-- (código do fornecedor → nome do fornecedor → nome geral → nome do produto) → a pessoa confirma,
-- liga os que faltam ou cria produto novo → importar_nota grava a nota, os similares e as entradas.
-- Mesmas permissões da 0046: equipe lê, Estoque/Gestão/Direção gravam (estoque.pode_movimentar).
-- Rode depois da 0046. Pode rodar mais de uma vez.

-- ---------- 1) Chave de nome (sem acento, minúscula, espaços únicos) ----------
create or replace function estoque.chave_nome(_nome text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(translate(lower(coalesce(_nome, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñý', 'aaaaaaeeeeiiiiooooouuuucny'), '\s+', ' ', 'g')), '')
$$;

-- ---------- 2) Tabelas ----------
create table if not exists estoque.similares (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references estoque.produtos (id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  chave text generated always as (estoque.chave_nome(nome)) stored,
  -- Sem CNPJ = vale para qualquer fornecedor.
  fornecedor_cnpj text check (fornecedor_cnpj is null or fornecedor_cnpj ~ '^[0-9]{11,14}$'),
  fornecedor_nome text,
  codigo_fornecedor text,
  fator numeric(14,4) not null default 1 check (fator > 0),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists similares_nome_unico
  on estoque.similares (coalesce(fornecedor_cnpj, ''), chave);
create unique index if not exists similares_codigo_unico
  on estoque.similares (fornecedor_cnpj, codigo_fornecedor)
  where fornecedor_cnpj is not null and codigo_fornecedor is not null;
create index if not exists similares_produto_idx on estoque.similares (produto_id);

create table if not exists estoque.notas (
  id uuid primary key default gen_random_uuid(),
  chave_acesso text unique check (chave_acesso is null or chave_acesso ~ '^[0-9]{44}$'),
  numero text,
  serie text,
  emissao date,
  fornecedor_cnpj text,
  fornecedor_nome text,
  fornecedor_id uuid references public.cadastros (id) on delete set null,
  valor_total numeric(14,2),
  itens integer not null default 0,
  importado_por uuid default auth.uid() references auth.users (id) on delete set null,
  importado_por_nome text,
  created_at timestamptz not null default now()
);

alter table estoque.movimentos
  add column if not exists nota_id uuid references estoque.notas (id) on delete set null;
create index if not exists movimentos_nota_idx on estoque.movimentos (nota_id);

alter table estoque.similares enable row level security;
alter table estoque.notas enable row level security;
revoke all on estoque.similares, estoque.notas from public, anon, authenticated;
grant all on estoque.similares, estoque.notas to service_role;

-- ---------- 3) Leitura ----------
create or replace view estoque.v_similares as
select s.id, s.produto_id, p.codigo, p.nome as produto, s.nome, s.fornecedor_cnpj,
  s.fornecedor_nome, s.codigo_fornecedor, s.fator, s.created_at
from estoque.similares s join estoque.produtos p on p.id = s.produto_id
where public.is_team_member(auth.uid());

create or replace view estoque.v_notas as
select n.id, n.chave_acesso, n.numero, n.serie, n.emissao, n.fornecedor_cnpj,
  coalesce(f.nome, n.fornecedor_nome) as fornecedor, n.fornecedor_id,
  case when estoque.pode_ver_custo(auth.uid()) then n.valor_total end as valor_total,
  n.itens, n.importado_por_nome, n.created_at
from estoque.notas n left join public.cadastros f on f.id = n.fornecedor_id
where public.is_team_member(auth.uid());

revoke all on estoque.v_similares, estoque.v_notas from public, anon;
grant select on estoque.v_similares, estoque.v_notas to authenticated, service_role;

-- ---------- 4) Identificar os itens de uma nota ----------
-- _itens: [{codigo, nome}] na ordem da nota. Devolve {fornecedor_id, ja_importada, itens:[{produto_id,
-- origem, fator}]} — origem: codigo | similar | similar_geral | produto | null (sem par).
create or replace function estoque.identificar_itens_nota(_cnpj text, _chave text, _itens jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cnpj text := nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '');
  r jsonb; v_prod uuid; v_origem text; v_fator numeric; saida jsonb := '[]';
begin
  perform estoque.exigir_movimentar();
  for r in select * from jsonb_array_elements(coalesce(_itens, '[]')) loop
    v_prod := null; v_origem := null; v_fator := 1;
    if v_cnpj is not null and nullif(btrim(r->>'codigo'), '') is not null then
      select produto_id, fator into v_prod, v_fator from estoque.similares
      where fornecedor_cnpj = v_cnpj and codigo_fornecedor = btrim(r->>'codigo');
      if v_prod is not null then v_origem := 'codigo'; end if;
    end if;
    if v_prod is null and v_cnpj is not null then
      select produto_id, fator into v_prod, v_fator from estoque.similares
      where fornecedor_cnpj = v_cnpj and chave = estoque.chave_nome(r->>'nome');
      if v_prod is not null then v_origem := 'similar'; end if;
    end if;
    if v_prod is null then
      select produto_id, fator into v_prod, v_fator from estoque.similares
      where fornecedor_cnpj is null and chave = estoque.chave_nome(r->>'nome');
      if v_prod is not null then v_origem := 'similar_geral'; end if;
    end if;
    if v_prod is null then
      select id into v_prod from estoque.produtos
      where estoque.chave_nome(nome) = estoque.chave_nome(r->>'nome') limit 1;
      if v_prod is not null then v_origem := 'produto'; v_fator := 1; end if;
    end if;
    saida := saida || jsonb_build_object('produto_id', v_prod, 'origem', v_origem,
      'fator', coalesce(v_fator, 1));
  end loop;
  return jsonb_build_object(
    'fornecedor_id', (select (array_agg(id))[1] from public.cadastros
      where v_cnpj is not null and cpf_cnpj_digitos = v_cnpj having count(*) = 1),
    'ja_importada', exists (select 1 from estoque.notas
      where chave_acesso = nullif(regexp_replace(coalesce(_chave, ''), '\D', '', 'g'), '')),
    'itens', saida);
end $$;

-- ---------- 5) Importar a nota ----------
-- _nota: {chave, numero, serie, emissao, cnpj, fornecedor_nome, fornecedor_id, valor_total,
--   itens:[{codigo, nome, quantidade, valor_unitario, lote, fator, lembrar,
--           produto_id | novo:{setor, nome, unidade}} | {ignorar: true}]}
-- A quantidade da nota × fator vira a quantidade do estoque; o valor unitário ÷ fator.
-- lembrar (padrão true) grava/atualiza o similar do fornecedor (nome + código + fator).
create or replace function estoque.importar_nota(_nota jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_nota uuid; r jsonb; v_prod uuid; v_fator numeric; v_qtd numeric; v_valor numeric;
  v_cnpj text := nullif(regexp_replace(coalesce(_nota->>'cnpj', ''), '\D', '', 'g'), '');
  v_chave text := nullif(regexp_replace(coalesce(_nota->>'chave', ''), '\D', '', 'g'), '');
  v_forn uuid := nullif(_nota->>'fornecedor_id', '')::uuid;
  v_forn_nome text := nullif(btrim(_nota->>'fornecedor_nome'), '');
  v_nome text; n integer := 0;
begin
  perform estoque.exigir_movimentar();
  if v_chave is not null and exists (select 1 from estoque.notas where chave_acesso = v_chave) then
    raise exception 'Esta nota já foi importada.' using errcode = '23505';
  end if;
  if v_cnpj is not null and length(v_cnpj) not between 11 and 14 then v_cnpj := null; end if;
  if v_forn is null and v_cnpj is not null then
    select (array_agg(id))[1] into v_forn from public.cadastros
    where cpf_cnpj_digitos = v_cnpj having count(*) = 1;
  end if;
  select display_name into v_nome from public.profiles where id = auth.uid();
  insert into estoque.notas (chave_acesso, numero, serie, emissao, fornecedor_cnpj, fornecedor_nome,
    fornecedor_id, valor_total, importado_por_nome)
  values (v_chave, nullif(btrim(_nota->>'numero'), ''), nullif(btrim(_nota->>'serie'), ''),
    nullif(_nota->>'emissao', '')::date, v_cnpj, v_forn_nome, v_forn,
    nullif(_nota->>'valor_total', '')::numeric, v_nome)
  returning id into v_nota;

  for r in select * from jsonb_array_elements(coalesce(_nota->'itens', '[]')) loop
    continue when coalesce((r->>'ignorar')::boolean, false);
    v_prod := nullif(r->>'produto_id', '')::uuid;
    if v_prod is null and r ? 'novo' then
      v_prod := estoque.salvar_produto(null, jsonb_build_object(
        'setor', r->'novo'->>'setor', 'nome', coalesce(nullif(r->'novo'->>'nome', ''), r->>'nome'),
        'unidade', r->'novo'->>'unidade', 'fornecedor_id', v_forn,
        'fornecedor_nome', case when v_forn is null then v_forn_nome end));
    end if;
    if v_prod is null or not exists (select 1 from estoque.produtos where id = v_prod) then
      raise exception 'Item "%": escolha o produto do estoque, crie um novo ou ignore.', r->>'nome'
        using errcode = '22023';
    end if;
    v_fator := coalesce(nullif(r->>'fator', '')::numeric, 1);
    if v_fator <= 0 then
      raise exception 'Item "%": o fator de conversão precisa ser maior que zero.', r->>'nome'
        using errcode = '22023';
    end if;
    v_qtd := (r->>'quantidade')::numeric * v_fator;
    v_valor := nullif(r->>'valor_unitario', '')::numeric / v_fator;

    if coalesce((r->>'lembrar')::boolean, true) then
      -- Same supplier code or same supplier name: point it at this product (and this factor).
      delete from estoque.similares
      where fornecedor_cnpj is not distinct from v_cnpj
        and (chave = estoque.chave_nome(r->>'nome')
          or (v_cnpj is not null and codigo_fornecedor = nullif(btrim(r->>'codigo'), '')));
      -- The product's own name needs no similar.
      if estoque.chave_nome(r->>'nome') is distinct from
         (select estoque.chave_nome(nome) from estoque.produtos where id = v_prod)
         or (v_cnpj is not null and nullif(btrim(r->>'codigo'), '') is not null) or v_fator <> 1 then
        insert into estoque.similares (produto_id, nome, fornecedor_cnpj, fornecedor_nome,
          codigo_fornecedor, fator)
        values (v_prod, btrim(r->>'nome'), v_cnpj, v_forn_nome,
          case when v_cnpj is not null then nullif(btrim(r->>'codigo'), '') end, v_fator);
      end if;
    end if;

    insert into estoque.movimentos (produto_id, tipo, data, quantidade, valor_unitario,
      fornecedor_id, fornecedor_nome, lote, nota_numero, nota_id, observacao, registrado_por_nome)
    values (v_prod, 'Entrada',
      least(coalesce(nullif(_nota->>'emissao', '')::date, (now() at time zone 'America/Sao_Paulo')::date),
        (now() at time zone 'America/Sao_Paulo')::date),
      v_qtd, v_valor, v_forn, case when v_forn is null then v_forn_nome end,
      nullif(btrim(r->>'lote'), ''), nullif(btrim(_nota->>'numero'), ''), v_nota,
      format('NF-e %s · %s', coalesce(_nota->>'numero', '?'), r->>'nome'), v_nome);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nenhum item para importar.' using errcode = '22023'; end if;
  update estoque.notas set itens = n where id = v_nota;
  return v_nota;
end $$;

-- ---------- 6) Similares à mão (na lista filha do produto) ----------
create or replace function estoque.salvar_similar(_produto uuid, _nome text, _fator numeric default 1)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform estoque.exigir_movimentar();
  if estoque.chave_nome(_nome) is null then
    raise exception 'Escreva o nome similar.' using errcode = '22023';
  end if;
  insert into estoque.similares (produto_id, nome, fator)
  values (_produto, btrim(_nome), coalesce(_fator, 1))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Esse nome já está ligado a um produto.' using errcode = '23505';
end $$;

create or replace function estoque.excluir_similar(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform estoque.exigir_movimentar();
  delete from estoque.similares where id = _id;
end $$;

-- v_movimentos ganha a nota (coluna nova no fim).
create or replace view estoque.v_movimentos as
select m.id, m.produto_id, p.codigo, p.nome as produto, p.unidade, m.tipo, m.data, m.quantidade,
  estoque.sinal(m.tipo, m.quantidade) as quantidade_sinal,
  case when estoque.pode_ver_custo(auth.uid()) then m.valor_unitario end as valor_unitario,
  m.fornecedor_id, coalesce(f.nome, m.fornecedor_nome) as fornecedor, m.lote,
  m.cliente_id, c.nome as cliente, m.ordem_id, o.numero as ordem_numero,
  m.responsavel, m.motivo, m.nota_numero, m.observacao, m.registrado_por_nome, m.created_at,
  m.nota_id
from estoque.movimentos m
join estoque.produtos p on p.id = m.produto_id
left join public.cadastros f on f.id = m.fornecedor_id
left join public.cadastros c on c.id = m.cliente_id
left join public.ordens_producao o on o.id = m.ordem_id
where public.is_team_member(auth.uid());

revoke execute on all functions in schema estoque from public, anon;
grant execute on function estoque.chave_nome(text) to authenticated, service_role;
grant execute on function estoque.identificar_itens_nota(text, text, jsonb) to authenticated, service_role;
grant execute on function estoque.importar_nota(jsonb) to authenticated, service_role;
grant execute on function estoque.salvar_similar(uuid, text, numeric) to authenticated, service_role;
grant execute on function estoque.excluir_similar(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
