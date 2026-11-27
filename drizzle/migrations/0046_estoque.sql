-- ============ Estoque, etapa 1 (plano em docs/estoque-plano.md) ============
-- Banco separado do estoque = schema `estoque` no mesmo Supabase (mesmo login).
--
--   estoque.setores     prefixos dos códigos: 01 Impressão … 08 EPI (equipe lê)
--   estoque.produtos    código automático = prefixo do setor + sequência (06.0001, 06.0002…)
--   estoque.movimentos  Entrada, Baixa, Devolução, Perda e Ajuste. O saldo é a soma; nada se
--                       altera depois de gravado (só a gestão exclui um lançamento errado).
--
-- Quem faz o quê:
--   - toda a equipe aprovada vê produtos, códigos e quantidades (views v_produtos, v_movimentos);
--   - custo e valores pagos só para Estoque, Gestão, Direção e Financeiro (nas views vêm nulos);
--   - produtos, entradas, baixas, devoluções, perdas e importação: função nova "estoque"
--     (almoxarife), Gestão e Direção — sempre pelas funções abaixo (nada de escrita direta).
--
-- DEPOIS DE RODAR: Supabase › Project Settings › Data API › Exposed schemas → acrescente
-- `estoque`. Sem isso o app não enxerga o schema.
-- Rode depois da 0045. Pode rodar mais de uma vez.

-- ---------- 1) Função nova e permissões ----------
alter type public.app_role add value if not exists 'estoque';

create schema if not exists estoque;
revoke all on schema estoque from public, anon;
grant usage on schema estoque to authenticated, service_role;

-- (usam role::text via has_any_role para funcionar na mesma transação do "add value")
create or replace function estoque.pode_movimentar(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'direcao', 'estoque'])
$$;

create or replace function estoque.pode_ver_custo(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'direcao', 'estoque', 'financeiro'])
$$;

revoke execute on function estoque.pode_movimentar(uuid) from public, anon;
revoke execute on function estoque.pode_ver_custo(uuid) from public, anon;
grant execute on function estoque.pode_movimentar(uuid) to authenticated, service_role;
grant execute on function estoque.pode_ver_custo(uuid) to authenticated, service_role;

-- ---------- 2) Tabelas ----------
create table if not exists estoque.setores (
  prefixo text primary key check (prefixo ~ '^[0-9]{2}$'),
  nome text not null unique check (length(btrim(nome)) > 0)
);
insert into estoque.setores (prefixo, nome) values
  ('01', 'Impressão'), ('02', 'Serralheria'), ('03', 'Projetos'), ('04', 'Corte'),
  ('05', 'Matéria-prima'), ('06', 'Insumos'), ('07', 'Ferramentas'), ('08', 'EPI')
on conflict (prefixo) do nothing;

create table if not exists estoque.produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  setor text not null references estoque.setores (prefixo) on update cascade,
  nome text not null check (length(btrim(nome)) > 0),
  unidade text not null default 'un'
    check (unidade in ('un', 'm', 'm²', 'chapa', 'rolo', 'litro', 'kg', 'caixa', 'par')),
  estoque_minimo numeric(14,3) check (estoque_minimo is null or estoque_minimo >= 0),
  -- Fornecedor de costume: um cadastro, ou só o nome (planilha sem cadastro que bata).
  fornecedor_id uuid references public.cadastros (id) on delete set null,
  fornecedor_nome text,
  observacao text,
  ativo boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists produtos_nome_unico on estoque.produtos (lower(btrim(nome)));
create index if not exists produtos_setor_idx on estoque.produtos (setor, codigo);

create table if not exists estoque.movimentos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references estoque.produtos (id) on delete restrict,
  tipo text not null check (tipo in ('Entrada', 'Baixa', 'Devolução', 'Perda', 'Ajuste')),
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  -- Positiva sempre, menos no Ajuste (que corrige para mais ou para menos).
  quantidade numeric(14,3) not null
    check (quantidade <> 0 and (tipo = 'Ajuste' or quantidade > 0)),
  valor_unitario numeric(14,4) check (valor_unitario is null or valor_unitario >= 0),
  fornecedor_id uuid references public.cadastros (id) on delete set null,
  fornecedor_nome text,
  lote text,
  cliente_id uuid references public.cadastros (id) on delete set null,
  ordem_id uuid references public.ordens_producao (id) on delete set null,
  responsavel text,
  motivo text check (motivo is null or motivo in ('Retrabalho', 'Produto defeituoso', 'Outro')),
  nota_numero text,
  observacao text,
  registrado_por uuid default auth.uid() references auth.users (id) on delete set null,
  registrado_por_nome text,
  created_at timestamptz not null default now(),
  check ((tipo = 'Perda') = (motivo is not null)),
  check (tipo = 'Entrada' or valor_unitario is null),
  check (tipo not in ('Baixa', 'Devolução', 'Perda') or length(btrim(coalesce(responsavel, ''))) > 0)
);
create index if not exists movimentos_produto_idx on estoque.movimentos (produto_id, data desc, created_at desc);
create index if not exists movimentos_data_idx on estoque.movimentos (data desc);
create index if not exists movimentos_ordem_idx on estoque.movimentos (ordem_id);

-- Nada é lido nem escrito direto nas tabelas: leitura pelas views, escrita pelas funções.
alter table estoque.setores enable row level security;
alter table estoque.produtos enable row level security;
alter table estoque.movimentos enable row level security;
revoke all on estoque.setores, estoque.produtos, estoque.movimentos from public, anon, authenticated;
grant all on estoque.setores, estoque.produtos, estoque.movimentos to service_role;
grant select on estoque.setores to authenticated;
drop policy if exists equipe_le on estoque.setores;
create policy equipe_le on estoque.setores for select to authenticated
  using (public.is_team_member(auth.uid()));

-- ---------- 3) Leitura (views do dono: filtram a equipe e escondem valores) ----------
create or replace function estoque.sinal(_tipo text, _quantidade numeric)
returns numeric language sql immutable as $$
  select case when _tipo in ('Baixa', 'Perda') then -_quantidade else _quantidade end
$$;

drop view if exists estoque.v_movimentos;
drop view if exists estoque.v_produtos;

create view estoque.v_produtos as
select p.id, p.codigo, p.setor, s.nome as setor_nome, p.nome, p.unidade, p.estoque_minimo,
  p.observacao, p.ativo, p.created_at, p.updated_at,
  p.fornecedor_id, coalesce(f.nome, p.fornecedor_nome, ue.fornecedor) as fornecedor,
  coalesce(sal.saldo, 0)::numeric(14,3) as quantidade,
  case when estoque.pode_ver_custo(auth.uid()) then ue.valor_unitario end as custo,
  ue.data as ultima_entrada, ue.lote as ultimo_lote,
  (p.estoque_minimo is not null and coalesce(sal.saldo, 0) < p.estoque_minimo) as abaixo_minimo,
  coalesce(sal.movimentos, 0)::integer as movimentos
from estoque.produtos p
join estoque.setores s on s.prefixo = p.setor
left join public.cadastros f on f.id = p.fornecedor_id
left join lateral (
  select sum(estoque.sinal(m.tipo, m.quantidade)) as saldo, count(*) as movimentos
  from estoque.movimentos m where m.produto_id = p.id
) sal on true
left join lateral (
  select m.valor_unitario, m.data, m.lote, coalesce(mf.nome, m.fornecedor_nome) as fornecedor
  from estoque.movimentos m left join public.cadastros mf on mf.id = m.fornecedor_id
  where m.produto_id = p.id and m.tipo = 'Entrada'
  order by m.data desc, m.created_at desc limit 1
) ue on true
where public.is_team_member(auth.uid());

create view estoque.v_movimentos as
select m.id, m.produto_id, p.codigo, p.nome as produto, p.unidade, m.tipo, m.data, m.quantidade,
  estoque.sinal(m.tipo, m.quantidade) as quantidade_sinal,
  case when estoque.pode_ver_custo(auth.uid()) then m.valor_unitario end as valor_unitario,
  m.fornecedor_id, coalesce(f.nome, m.fornecedor_nome) as fornecedor, m.lote,
  m.cliente_id, c.nome as cliente, m.ordem_id, o.numero as ordem_numero,
  m.responsavel, m.motivo, m.nota_numero, m.observacao, m.registrado_por_nome, m.created_at
from estoque.movimentos m
join estoque.produtos p on p.id = m.produto_id
left join public.cadastros f on f.id = m.fornecedor_id
left join public.cadastros c on c.id = m.cliente_id
left join public.ordens_producao o on o.id = m.ordem_id
where public.is_team_member(auth.uid());

revoke all on estoque.v_produtos, estoque.v_movimentos from public, anon;
grant select on estoque.v_produtos, estoque.v_movimentos to authenticated, service_role;

-- ---------- 4) Escrita ----------
create or replace function estoque.exigir_movimentar()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not estoque.pode_movimentar(auth.uid()) then
    raise exception 'Somente Estoque, Gestão e Direção alteram o estoque.' using errcode = '42501';
  end if;
end $$;

-- Cria (sem _id) ou altera um produto. O código nasce do setor e não muda depois.
create or replace function estoque.salvar_produto(_id uuid, _dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := _id;
  v_setor text := nullif(btrim(_dados->>'setor'), '');
  v_nome text := regexp_replace(btrim(coalesce(_dados->>'nome', '')), '\s+', ' ', 'g');
  v_atual estoque.produtos;
  v_seq integer;
begin
  perform estoque.exigir_movimentar();
  if v_nome = '' then raise exception 'Escreva o nome do produto.' using errcode = '22023'; end if;
  if v_id is null then
    if v_setor is null or not exists (select 1 from estoque.setores where prefixo = v_setor) then
      raise exception 'Escolha o setor do produto.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtext('estoque.codigo.' || v_setor));
    select coalesce(max(nullif(split_part(codigo, '.', 2), '')::integer), 0) + 1 into v_seq
    from estoque.produtos where setor = v_setor and codigo ~ ('^' || v_setor || '\.[0-9]+$');
    insert into estoque.produtos (codigo, setor, nome, unidade, estoque_minimo, fornecedor_id,
      fornecedor_nome, observacao, ativo)
    values (v_setor || '.' || lpad(v_seq::text, 4, '0'), v_setor, v_nome,
      coalesce(nullif(_dados->>'unidade', ''), 'un'),
      nullif(_dados->>'estoque_minimo', '')::numeric,
      nullif(_dados->>'fornecedor_id', '')::uuid, nullif(btrim(_dados->>'fornecedor_nome'), ''),
      nullif(btrim(_dados->>'observacao'), ''), coalesce((_dados->>'ativo')::boolean, true))
    returning id into v_id;
  else
    select * into v_atual from estoque.produtos where id = v_id for update;
    if not found then raise exception 'Produto não encontrado.' using errcode = 'P0002'; end if;
    if v_setor is not null and v_setor <> v_atual.setor then
      raise exception 'O setor faz parte do código (%) e não muda. Crie um produto novo no outro setor.',
        v_atual.codigo using errcode = '22023';
    end if;
    update estoque.produtos set
      nome = v_nome,
      unidade = coalesce(nullif(_dados->>'unidade', ''), unidade),
      estoque_minimo = nullif(_dados->>'estoque_minimo', '')::numeric,
      fornecedor_id = nullif(_dados->>'fornecedor_id', '')::uuid,
      fornecedor_nome = nullif(btrim(_dados->>'fornecedor_nome'), ''),
      observacao = nullif(btrim(_dados->>'observacao'), ''),
      ativo = coalesce((_dados->>'ativo')::boolean, ativo),
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

-- Só exclui produto sem nenhum movimento; com histórico, desative.
create or replace function estoque.excluir_produto(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform estoque.exigir_movimentar();
  if exists (select 1 from estoque.movimentos where produto_id = _id) then
    raise exception 'Este produto já tem movimentos. Desative em vez de excluir.' using errcode = '23503';
  end if;
  delete from estoque.produtos where id = _id;
end $$;

-- Entrada, Baixa, Devolução, Perda ou Ajuste. Com ordem e sem cliente, o cliente vem da ordem.
create or replace function estoque.registrar_movimento(_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_tipo text := _dados->>'tipo';
  v_data date := coalesce(nullif(_dados->>'data', '')::date,
    (now() at time zone 'America/Sao_Paulo')::date);
  v_ordem uuid := nullif(_dados->>'ordem_id', '')::uuid;
  v_cliente uuid := nullif(_dados->>'cliente_id', '')::uuid;
  v_nome text;
begin
  perform estoque.exigir_movimentar();
  if v_tipo is null or v_tipo not in ('Entrada', 'Baixa', 'Devolução', 'Perda', 'Ajuste') then
    raise exception 'Tipo de movimento inválido.' using errcode = '22023';
  end if;
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data não pode ser no futuro.' using errcode = '22023';
  end if;
  if not exists (select 1 from estoque.produtos where id = nullif(_dados->>'produto_id', '')::uuid) then
    raise exception 'Escolha o produto.' using errcode = '22023';
  end if;
  if coalesce(nullif(_dados->>'quantidade', '')::numeric, 0) = 0
     or (v_tipo <> 'Ajuste' and (_dados->>'quantidade')::numeric < 0) then
    raise exception 'Informe a quantidade.' using errcode = '22023';
  end if;
  if v_tipo in ('Baixa', 'Devolução', 'Perda') and nullif(btrim(_dados->>'responsavel'), '') is null then
    raise exception 'Informe o responsável.' using errcode = '22023';
  end if;
  if v_tipo = 'Perda' and coalesce(_dados->>'motivo', '') not in ('Retrabalho', 'Produto defeituoso', 'Outro') then
    raise exception 'Escolha o motivo da perda.' using errcode = '22023';
  end if;
  if v_ordem is not null and v_cliente is null then
    select cadastro_id into v_cliente from public.ordens_producao where id = v_ordem;
  end if;
  select display_name into v_nome from public.profiles where id = auth.uid();
  insert into estoque.movimentos (produto_id, tipo, data, quantidade, valor_unitario, fornecedor_id,
    fornecedor_nome, lote, cliente_id, ordem_id, responsavel, motivo, nota_numero, observacao,
    registrado_por_nome)
  values ((_dados->>'produto_id')::uuid, v_tipo, v_data, (_dados->>'quantidade')::numeric,
    case when v_tipo = 'Entrada' then nullif(_dados->>'valor_unitario', '')::numeric end,
    nullif(_dados->>'fornecedor_id', '')::uuid, nullif(btrim(_dados->>'fornecedor_nome'), ''),
    nullif(btrim(_dados->>'lote'), ''), v_cliente, v_ordem,
    nullif(btrim(_dados->>'responsavel'), ''),
    case when v_tipo = 'Perda' then nullif(_dados->>'motivo', '') end,
    nullif(btrim(_dados->>'nota_numero'), ''), nullif(btrim(_dados->>'observacao'), ''), v_nome)
  returning id into v_id;
  return v_id;
end $$;

-- Lançamento errado: só a gestão exclui (o resto da equipe corrige com Ajuste ou Devolução).
create or replace function estoque.excluir_movimento(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'gestor') then
    raise exception 'Somente a Gestão exclui um lançamento. Corrija com um Ajuste.' using errcode = '42501';
  end if;
  delete from estoque.movimentos where id = _id;
end $$;

-- Carga da planilha: cada linha {codigo?, produto, setor, unidade, quantidade, custo, fornecedor,
-- lote, minimo}. Acha o produto pelo código ou pelo nome; sem par, cria (precisa do setor).
-- Quantidade > 0 vira Entrada "Importação da planilha". Devolve {criados, entradas, erros[]}.
create or replace function estoque.importar_planilha(_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; i integer := 0; v_prod uuid; v_setor text; v_forn uuid; v_forn_nome text;
  v_qtd numeric; criados integer := 0; entradas integer := 0; erros jsonb := '[]';
begin
  perform estoque.exigir_movimentar();
  for r in select * from jsonb_array_elements(coalesce(_linhas, '[]')) loop
    i := i + 1;
    begin
      v_prod := null;
      if nullif(btrim(r->>'codigo'), '') is not null then
        select id into v_prod from estoque.produtos where codigo = btrim(r->>'codigo');
      end if;
      if v_prod is null then
        select id into v_prod from estoque.produtos
        where lower(btrim(nome)) = lower(regexp_replace(btrim(coalesce(r->>'produto', '')), '\s+', ' ', 'g'));
      end if;
      v_forn_nome := nullif(btrim(r->>'fornecedor'), '');
      v_forn := null;
      if v_forn_nome is not null then
        select (array_agg(id))[1] into v_forn from public.cadastros
        where lower(btrim(nome)) = lower(v_forn_nome) or lower(btrim(razao_social)) = lower(v_forn_nome)
        having count(*) = 1;
      end if;
      if v_prod is null then
        select prefixo into v_setor from estoque.setores
        where prefixo = lpad(btrim(coalesce(r->>'setor', '')), 2, '0')
          or lower(nome) = lower(btrim(coalesce(r->>'setor', '')));
        if v_setor is null then
          raise exception 'setor "%" não existe (use 01 a 08 ou o nome)', coalesce(r->>'setor', '');
        end if;
        v_prod := estoque.salvar_produto(null, jsonb_build_object('setor', v_setor,
          'nome', r->>'produto', 'unidade', nullif(r->>'unidade', ''),
          'estoque_minimo', nullif(r->>'minimo', ''),
          'fornecedor_id', v_forn, 'fornecedor_nome', case when v_forn is null then v_forn_nome end));
        criados := criados + 1;
      end if;
      v_qtd := nullif(btrim(coalesce(r->>'quantidade', '')), '')::numeric;
      if v_qtd is not null and v_qtd > 0 then
        perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Entrada',
          'produto_id', v_prod, 'quantidade', v_qtd, 'valor_unitario', nullif(r->>'custo', ''),
          'fornecedor_id', v_forn, 'fornecedor_nome', case when v_forn is null then v_forn_nome end,
          'lote', r->>'lote', 'observacao', 'Importação da planilha'));
        entradas := entradas + 1;
      end if;
    exception when others then
      erros := erros || jsonb_build_object('linha', i, 'produto', r->>'produto', 'erro', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('criados', criados, 'entradas', entradas, 'erros', erros);
end $$;

revoke execute on all functions in schema estoque from public, anon;
grant execute on function estoque.sinal(text, numeric) to authenticated, service_role;
grant execute on function estoque.salvar_produto(uuid, jsonb) to authenticated, service_role;
grant execute on function estoque.excluir_produto(uuid) to authenticated, service_role;
grant execute on function estoque.registrar_movimento(jsonb) to authenticated, service_role;
grant execute on function estoque.excluir_movimento(uuid) to authenticated, service_role;
grant execute on function estoque.importar_planilha(jsonb) to authenticated, service_role;
revoke execute on function estoque.exigir_movimentar() from authenticated;

-- Avisa a API (PostgREST) para reler os schemas depois de expor `estoque`.
notify pgrst, 'reload schema';
