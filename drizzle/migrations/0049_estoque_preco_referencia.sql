-- Estoque: preço de referência e unidade "barra" (para a carga da tabela de preços de materiais).
--   * produtos.preco_referencia / preco_referencia_data: o preço da tabela de preços (cotação),
--     usado enquanto o produto não tem nenhuma Entrada. O "custo" da tela passa a ser o último
--     valor pago numa Entrada ou, sem entrada, o preço de referência (custo_origem diz qual).
--     Mesma regra de sigilo: só Estoque, Gestão, Direção e Financeiro veem.
--   * Unidade nova "barra" (metalon, cantoneira, tubo).
--   * Importar planilha: a coluna custo sem quantidade grava o preço de referência (com
--     quantidade continua virando Entrada com esse valor). Coluna nova opcional "observacao".
-- Pode rodar mais de uma vez.

-- ---------- 1) Colunas e unidade ----------
alter table estoque.produtos
  add column if not exists preco_referencia numeric(14,4) check (preco_referencia >= 0),
  add column if not exists preco_referencia_data date;

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'estoque.produtos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%unidade%'
  loop
    execute format('alter table estoque.produtos drop constraint %I', c);
  end loop;
end $$;
alter table estoque.produtos add constraint produtos_unidade_check
  check (unidade in ('un', 'm', 'm²', 'chapa', 'rolo', 'barra', 'litro', 'kg', 'caixa', 'par'));

-- ---------- 2) Leitura: custo = último valor pago ou, sem entrada, a referência ----------
-- (create or replace: as colunas antigas ficam iguais e na mesma ordem; as novas vão no fim)
create or replace view estoque.v_produtos as
select p.id, p.codigo, p.setor, s.nome as setor_nome, p.nome, p.unidade, p.estoque_minimo,
  p.observacao, p.ativo, p.created_at, p.updated_at,
  p.fornecedor_id, coalesce(f.nome, p.fornecedor_nome, ue.fornecedor) as fornecedor,
  coalesce(sal.saldo, 0)::numeric(14,3) as quantidade,
  case when estoque.pode_ver_custo(auth.uid()) then coalesce(ue.valor_unitario, p.preco_referencia) end as custo,
  ue.data as ultima_entrada, ue.lote as ultimo_lote,
  (p.estoque_minimo is not null and coalesce(sal.saldo, 0) < p.estoque_minimo) as abaixo_minimo,
  coalesce(sal.movimentos, 0)::integer as movimentos,
  case when estoque.pode_ver_custo(auth.uid()) then p.preco_referencia end as preco_referencia,
  p.preco_referencia_data,
  case when ue.valor_unitario is not null then 'entrada'
       when p.preco_referencia is not null then 'referencia' end as custo_origem
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

-- ---------- 3) Salvar produto: aceita o preço de referência ----------
-- Igual à da 0046, mais preco_referencia (chave ausente = não mexe; vazio = apaga).
create or replace function estoque.salvar_produto(_id uuid, _dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := _id;
  v_setor text := nullif(btrim(_dados->>'setor'), '');
  v_nome text := regexp_replace(btrim(coalesce(_dados->>'nome', '')), '\s+', ' ', 'g');
  v_atual estoque.produtos;
  v_seq integer;
  v_tem_preco boolean := _dados ? 'preco_referencia';
  v_preco numeric := nullif(_dados->>'preco_referencia', '')::numeric;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
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
      fornecedor_nome, observacao, ativo, preco_referencia, preco_referencia_data)
    values (v_setor || '.' || lpad(v_seq::text, 4, '0'), v_setor, v_nome,
      coalesce(nullif(_dados->>'unidade', ''), 'un'),
      nullif(_dados->>'estoque_minimo', '')::numeric,
      nullif(_dados->>'fornecedor_id', '')::uuid, nullif(btrim(_dados->>'fornecedor_nome'), ''),
      nullif(btrim(_dados->>'observacao'), ''), coalesce((_dados->>'ativo')::boolean, true),
      v_preco, case when v_preco is not null
        then coalesce(nullif(_dados->>'preco_referencia_data', '')::date, v_hoje) end)
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
      preco_referencia = case when v_tem_preco then v_preco else preco_referencia end,
      preco_referencia_data = case
        when not v_tem_preco then preco_referencia_data
        when v_preco is null then null
        when v_preco is distinct from v_atual.preco_referencia
          then coalesce(nullif(_dados->>'preco_referencia_data', '')::date, v_hoje)
        else preco_referencia_data end,
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

-- ---------- 4) Importar planilha: custo sem quantidade = preço de referência ----------
-- Linha {codigo?, produto, setor, unidade, quantidade, custo, fornecedor, lote, minimo,
-- observacao?, data_preco?}. Devolve {criados, entradas, precos, erros[]}.
create or replace function estoque.importar_planilha(_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; i integer := 0; v_prod uuid; v_setor text; v_forn uuid; v_forn_nome text;
  v_qtd numeric; v_custo numeric; criados integer := 0; entradas integer := 0; precos integer := 0;
  erros jsonb := '[]';
begin
  perform estoque.exigir_movimentar();
  for r in select * from jsonb_array_elements(coalesce(_linhas, '[]')) loop
    i := i + 1;
    begin
      v_prod := null;
      v_setor := null;
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
      v_custo := nullif(btrim(coalesce(r->>'custo', '')), '')::numeric;
      v_qtd := nullif(btrim(coalesce(r->>'quantidade', '')), '')::numeric;
      if v_prod is null then
        select prefixo into v_setor from estoque.setores
        where prefixo = lpad(btrim(coalesce(r->>'setor', '')), 2, '0')
          or lower(nome) = lower(btrim(coalesce(r->>'setor', '')));
        if v_setor is null then
          raise exception 'setor "%" não existe (use 01 a 08 ou o nome)', coalesce(r->>'setor', '');
        end if;
        v_prod := estoque.salvar_produto(null, jsonb_build_object('setor', v_setor,
          'nome', r->>'produto', 'unidade', nullif(r->>'unidade', ''),
          'estoque_minimo', nullif(r->>'minimo', ''), 'observacao', nullif(r->>'observacao', ''),
          'fornecedor_id', v_forn, 'fornecedor_nome', case when v_forn is null then v_forn_nome end));
        criados := criados + 1;
      end if;
      if v_custo is not null and (v_qtd is null or v_qtd <= 0) then
        update estoque.produtos set preco_referencia = v_custo,
          preco_referencia_data = coalesce(nullif(r->>'data_preco', '')::date,
            (now() at time zone 'America/Sao_Paulo')::date),
          updated_at = now()
        where id = v_prod;
        precos := precos + 1;
      end if;
      if v_qtd is not null and v_qtd > 0 then
        perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Entrada',
          'produto_id', v_prod, 'quantidade', v_qtd, 'valor_unitario', v_custo,
          'fornecedor_id', v_forn, 'fornecedor_nome', case when v_forn is null then v_forn_nome end,
          'lote', r->>'lote', 'observacao', 'Importação da planilha'));
        entradas := entradas + 1;
      end if;
    exception when others then
      erros := erros || jsonb_build_object('linha', i, 'produto', r->>'produto', 'erro', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('criados', criados, 'entradas', entradas, 'precos', precos, 'erros', erros);
end $$;

grant execute on function estoque.salvar_produto(uuid, jsonb) to authenticated, service_role;
grant execute on function estoque.importar_planilha(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
