-- ============ Cadastros (vindos do PattyOne / SIGE) ============
-- Clientes, fornecedores e prestadores do grupo. Mesma estrutura do sistema PattyOne,
-- agora com as funções do Patty One:
--   - toda a equipe aprovada vê (is_team_member)
--   - comercial e gestão incluem, editam e atribuem vendedor
--   - só a gestão exclui e importa a planilha do SIGE
--   - dados bancários: só direção e financeiro (função nova "financeiro")
-- As marcas de restrição do SIGE só mudam pela importação (o formulário não as envia).
-- Rode depois da 0017. Pode rodar mais de uma vez.

-- ---------- 1) Função nova ----------
alter type public.app_role add value if not exists 'financeiro';

-- (usam role::text para funcionar na mesma transação do "add value")
create or replace function public.can_editar_cadastros(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial'])
$$;

create or replace function public.can_ver_bancario(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['direcao', 'financeiro'])
$$;

revoke execute on function public.can_editar_cadastros(uuid) from public, anon;
revoke execute on function public.can_ver_bancario(uuid) from public, anon;
grant execute on function public.can_editar_cadastros(uuid) to authenticated, service_role;
grant execute on function public.can_ver_bancario(uuid) to authenticated, service_role;

-- ---------- 2) Tabelas ----------
create table if not exists public.cadastros (
  id uuid primary key default gen_random_uuid(),
  id_sige text,
  tipo_pessoa text check (tipo_pessoa in ('Pessoa Jurídica', 'Pessoa Física')),
  nome text not null,
  razao_social text,
  cpf_cnpj text,
  cpf_cnpj_digitos text,
  ie text,
  im text,
  is_cliente boolean default false,
  is_fornecedor boolean default false,
  is_prestador boolean default false,
  vendedor text,
  origem text,
  contato text,
  celular text,
  celular2 text,
  telefone text,
  telefone2 text,
  email text,
  email2 text,
  contato_financeiro text,
  telefone_financeiro text,
  email_financeiro text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado char(2),
  codigo_municipio text,
  reter_iss boolean default false,
  percentual_iss numeric,
  tipo_comissao text default 'Nenhuma' check (tipo_comissao in (
    'Nenhuma', 'Comissão como Agência', 'Comissão como Representante', 'Comissão de aluguel')),
  percentual_comissao numeric,
  percentual_servicos numeric,
  observacao text,
  validado text default 'Não' check (validado in ('Sim', 'Não')),
  -- Só a importação do SIGE mexe nestes três.
  restricao_sige boolean not null default false,
  restricao_observacao text,
  dados_sige jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cadastros_documento_unique on public.cadastros (cpf_cnpj_digitos)
  where cpf_cnpj_digitos is not null and cpf_cnpj_digitos <> '';
create unique index if not exists cadastros_sige_unique on public.cadastros (id_sige)
  where id_sige is not null and id_sige <> '';
create index if not exists cadastros_nome_idx on public.cadastros (nome);
create index if not exists cadastros_cidade_idx on public.cadastros (cidade);
create index if not exists cadastros_estado_idx on public.cadastros (estado);
create index if not exists cadastros_vendedor_idx on public.cadastros (vendedor);
create index if not exists cadastros_email_idx on public.cadastros (email);

create table if not exists public.cadastros_bancario (
  cadastro_id uuid primary key references public.cadastros (id) on delete cascade,
  titular text,
  banco text,
  cod_banco text,
  agencia text,
  conta text
);

-- ---------- 3) Quem pode o quê ----------
alter table public.cadastros enable row level security;
alter table public.cadastros_bancario enable row level security;
revoke all on public.cadastros, public.cadastros_bancario from public, anon;
grant select, insert, update, delete on public.cadastros, public.cadastros_bancario to authenticated;
grant all on public.cadastros, public.cadastros_bancario to service_role;

drop policy if exists cadastros_select on public.cadastros;
drop policy if exists cadastros_insert on public.cadastros;
drop policy if exists cadastros_update on public.cadastros;
drop policy if exists cadastros_delete on public.cadastros;
create policy cadastros_select on public.cadastros for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy cadastros_insert on public.cadastros for insert to authenticated
  with check (public.can_editar_cadastros(auth.uid()));
create policy cadastros_update on public.cadastros for update to authenticated
  using (public.can_editar_cadastros(auth.uid())) with check (public.can_editar_cadastros(auth.uid()));
create policy cadastros_delete on public.cadastros for delete to authenticated
  using (public.has_any_role(auth.uid(), array['gestor']));

drop policy if exists bancario_acesso on public.cadastros_bancario;
create policy bancario_acesso on public.cadastros_bancario for all to authenticated
  using (public.can_ver_bancario(auth.uid())) with check (public.can_ver_bancario(auth.uid()));

-- ---------- 4) Normalização (nome obrigatório, só dígitos do documento, UF maiúscula) ----------
create or replace function public.normalizar_cadastro()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nome := nullif(trim(new.nome), '');
  if new.nome is null then raise exception 'Nome obrigatório'; end if;
  new.id_sige := nullif(trim(new.id_sige), '');
  new.cpf_cnpj_digitos := nullif(regexp_replace(coalesce(new.cpf_cnpj, ''), '[^0-9]', '', 'g'), '');
  new.estado := nullif(upper(trim(new.estado)), '');
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists normalizar_cadastro on public.cadastros;
create trigger normalizar_cadastro before insert or update on public.cadastros
  for each row execute function public.normalizar_cadastro();

-- ---------- 5) Salvar (ficha) ----------
-- Roda com as permissões de quem chama (RLS vale). Campos bancários só entram para
-- direção/financeiro. restricao_sige/dados_sige ficam de fora: não são alterados aqui.
create or replace function public.salvar_cadastro(dados jsonb, cadastro_uuid uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  r public.cadastros;
  destino uuid;
begin
  if not public.can_editar_cadastros(auth.uid()) then
    raise exception 'Só comercial e gestão alteram cadastros' using errcode = '42501';
  end if;
  if cadastro_uuid is not null then
    select * into r from public.cadastros where id = cadastro_uuid for update;
    if not found then raise exception 'Cadastro não encontrado'; end if;
  else
    r.id := gen_random_uuid();
    r.is_cliente := false; r.is_fornecedor := false; r.is_prestador := false;
    r.reter_iss := false; r.tipo_comissao := 'Nenhuma'; r.validado := 'Não';
  end if;
  r := jsonb_populate_record(r, dados - 'id' - 'created_at' - 'updated_at' - 'cpf_cnpj_digitos'
    - 'restricao_sige' - 'restricao_observacao' - 'dados_sige');

  insert into public.cadastros (id, id_sige, tipo_pessoa, nome, razao_social, cpf_cnpj, ie, im,
    is_cliente, is_fornecedor, is_prestador, vendedor, origem, contato, celular, celular2,
    telefone, telefone2, email, email2, contato_financeiro, telefone_financeiro, email_financeiro,
    cep, endereco, numero, complemento, bairro, cidade, estado, codigo_municipio, reter_iss,
    percentual_iss, tipo_comissao, percentual_comissao, percentual_servicos, observacao, validado)
  values (r.id, r.id_sige, r.tipo_pessoa, r.nome, r.razao_social, r.cpf_cnpj, r.ie, r.im,
    r.is_cliente, r.is_fornecedor, r.is_prestador, r.vendedor, r.origem, r.contato, r.celular,
    r.celular2, r.telefone, r.telefone2, r.email, r.email2, r.contato_financeiro,
    r.telefone_financeiro, r.email_financeiro, r.cep, r.endereco, r.numero, r.complemento,
    r.bairro, r.cidade, r.estado, r.codigo_municipio, r.reter_iss, r.percentual_iss,
    r.tipo_comissao, r.percentual_comissao, r.percentual_servicos, r.observacao, r.validado)
  on conflict (id) do update set
    id_sige = excluded.id_sige, tipo_pessoa = excluded.tipo_pessoa, nome = excluded.nome,
    razao_social = excluded.razao_social, cpf_cnpj = excluded.cpf_cnpj, ie = excluded.ie,
    im = excluded.im, is_cliente = excluded.is_cliente, is_fornecedor = excluded.is_fornecedor,
    is_prestador = excluded.is_prestador, vendedor = excluded.vendedor, origem = excluded.origem,
    contato = excluded.contato, celular = excluded.celular, celular2 = excluded.celular2,
    telefone = excluded.telefone, telefone2 = excluded.telefone2, email = excluded.email,
    email2 = excluded.email2, contato_financeiro = excluded.contato_financeiro,
    telefone_financeiro = excluded.telefone_financeiro, email_financeiro = excluded.email_financeiro,
    cep = excluded.cep, endereco = excluded.endereco, numero = excluded.numero,
    complemento = excluded.complemento, bairro = excluded.bairro, cidade = excluded.cidade,
    estado = excluded.estado, codigo_municipio = excluded.codigo_municipio,
    reter_iss = excluded.reter_iss, percentual_iss = excluded.percentual_iss,
    tipo_comissao = excluded.tipo_comissao, percentual_comissao = excluded.percentual_comissao,
    percentual_servicos = excluded.percentual_servicos, observacao = excluded.observacao,
    validado = excluded.validado
  returning id into destino;

  if dados ?| array['titular', 'banco', 'cod_banco', 'agencia', 'conta'] then
    if not public.can_ver_bancario(auth.uid()) then
      raise exception 'Dados bancários: só direção e financeiro' using errcode = '42501';
    end if;
    insert into public.cadastros_bancario (cadastro_id, titular, banco, cod_banco, agencia, conta)
    values (destino, dados->>'titular', dados->>'banco', dados->>'cod_banco', dados->>'agencia', dados->>'conta')
    on conflict (cadastro_id) do update set titular = excluded.titular, banco = excluded.banco,
      cod_banco = excluded.cod_banco, agencia = excluded.agencia, conta = excluded.conta;
  end if;
  return destino;
end;
$$;
revoke all on function public.salvar_cadastro(jsonb, uuid) from public, anon;
grant execute on function public.salvar_cadastro(jsonb, uuid) to authenticated;

-- ---------- 6) Importação da planilha do SIGE (só gestão, lotes de até 500) ----------
-- Atualiza pelo CPF/CNPJ ou pelo ID SIGE. Colunas bancárias da planilha só entram se
-- quem importa também for direção/financeiro; senão são ignoradas.
create or replace function public.importar_cadastros(linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  linha jsonb;
  destino uuid;
  digitos text;
  resultado jsonb := '[]';
  status text;
  motivo text;
  pode_bancario boolean := public.can_ver_bancario(auth.uid());
begin
  if not public.has_any_role(auth.uid(), array['gestor']) then
    raise exception 'Só a gestão importa cadastros' using errcode = '42501';
  end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) > 500 then
    raise exception 'Limite de 500 linhas por lote';
  end if;
  for linha in select value from jsonb_array_elements(linhas) loop
    begin
      if nullif(trim(linha->>'nome'), '') is null then raise exception 'Nome obrigatório'; end if;
      if not pode_bancario then
        linha := linha - 'titular' - 'banco' - 'cod_banco' - 'agencia' - 'conta';
      end if;
      destino := null;
      digitos := nullif(regexp_replace(coalesce(linha->>'cpf_cnpj', ''), '[^0-9]', '', 'g'), '');
      if digitos is null and nullif(trim(linha->>'id_sige'), '') is null then
        raise exception 'Informe CPF/CNPJ ou ID SIGE para evitar duplicações';
      end if;
      perform pg_advisory_xact_lock(hashtextextended(coalesce(digitos, nullif(trim(linha->>'id_sige'), '')), 0));
      if digitos is not null then
        select id into destino from public.cadastros where cpf_cnpj_digitos = digitos;
      else
        select id into destino from public.cadastros where id_sige = nullif(trim(linha->>'id_sige'), '');
      end if;
      status := case when destino is null then 'inserido' else 'atualizado' end;
      destino := public.salvar_cadastro(linha, destino);
      resultado := resultado || jsonb_build_array(jsonb_build_object('linha', linha->'linha',
        'nome', linha->>'nome', 'cpf_cnpj', linha->>'cpf_cnpj', 'resultado', status, 'id', destino, 'motivo', null));
    exception when others then
      motivo := case when sqlstate = '23505' then 'CPF/CNPJ ou ID SIGE já cadastrado em outro registro' else sqlerrm end;
      resultado := resultado || jsonb_build_array(jsonb_build_object('linha', linha->'linha',
        'nome', linha->>'nome', 'cpf_cnpj', linha->>'cpf_cnpj', 'resultado', 'erro', 'motivo', motivo));
    end;
  end loop;
  return resultado;
end;
$$;
revoke all on function public.importar_cadastros(jsonb) from public, anon;
grant execute on function public.importar_cadastros(jsonb) to authenticated;

-- ---------- 7) Lista paginada (50 por página) com busca e filtros ----------
create or replace function public.cadastro_corresponde(c public.cadastros, filtros jsonb)
returns boolean language sql immutable set search_path = public as $$
  select
    (coalesce(filtros->>'busca', '') = ''
      or c.nome ilike '%' || (filtros->>'busca') || '%'
      or c.razao_social ilike '%' || (filtros->>'busca') || '%'
      or c.cpf_cnpj ilike '%' || (filtros->>'busca') || '%'
      or (regexp_replace(filtros->>'busca', '[^0-9]', '', 'g') <> ''
          and c.cpf_cnpj_digitos like '%' || regexp_replace(filtros->>'busca', '[^0-9]', '', 'g') || '%')
      or c.cidade ilike '%' || (filtros->>'busca') || '%'
      or c.email ilike '%' || (filtros->>'busca') || '%'
      or c.email2 ilike '%' || (filtros->>'busca') || '%')
    and (coalesce(filtros->>'vendedor', '') = '' or c.vendedor = filtros->>'vendedor')
    and (coalesce(filtros->>'estado', '') = '' or c.estado = filtros->>'estado')
    and (coalesce((filtros->>'sem_vendedor')::boolean, false) = false or nullif(trim(c.vendedor), '') is null)
    and (coalesce(filtros->>'tipo', '') = ''
      or (filtros->>'tipo' = 'cliente' and c.is_cliente)
      or (filtros->>'tipo' = 'fornecedor' and c.is_fornecedor)
      or (filtros->>'tipo' = 'prestador' and c.is_prestador));
$$;

create or replace function public.listar_cadastros(filtros jsonb default '{}', pagina integer default 1)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  total bigint;
  linhas jsonb;
  vendedores jsonb;
  estados jsonb;
begin
  if not public.is_team_member(auth.uid()) then
    raise exception 'Acesso restrito' using errcode = '42501';
  end if;
  select count(*) into total from public.cadastros c where public.cadastro_corresponde(c, filtros);
  select coalesce(jsonb_agg(to_jsonb(t)), '[]') into linhas from (
    select id, nome, cpf_cnpj, cidade, estado, vendedor, is_cliente, is_fornecedor, is_prestador,
      restricao_sige, restricao_observacao, coalesce(celular, telefone, telefone2, celular2) as telefone
    from public.cadastros c where public.cadastro_corresponde(c, filtros)
    order by nome, id limit 50 offset (greatest(pagina, 1) - 1) * 50) t;
  select coalesce(jsonb_agg(vendedor order by vendedor), '[]') into vendedores
    from (select distinct vendedor from public.cadastros where nullif(trim(vendedor), '') is not null) t;
  select coalesce(jsonb_agg(estado order by estado), '[]') into estados
    from (select distinct estado from public.cadastros where estado is not null) t;
  return jsonb_build_object('total', total, 'linhas', linhas, 'vendedores', vendedores, 'estados', estados);
end;
$$;

-- ---------- 8) Atribuir vendedor em massa (selecionados ou todo o filtro) ----------
create or replace function public.atribuir_vendedor(vendedor_novo text, ids uuid[] default null, filtros jsonb default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  quantidade integer;
begin
  if not public.can_editar_cadastros(auth.uid()) then
    raise exception 'Só comercial e gestão alteram cadastros' using errcode = '42501';
  end if;
  if nullif(trim(vendedor_novo), '') is null then raise exception 'Vendedor obrigatório'; end if;
  if ids is null and filtros is null then raise exception 'Seleção obrigatória'; end if;
  update public.cadastros c set vendedor = trim(vendedor_novo)
   where (ids is not null and c.id = any (ids))
      or (ids is null and filtros is not null and public.cadastro_corresponde(c, filtros));
  get diagnostics quantidade = row_count;
  return quantidade;
end;
$$;

revoke all on function public.cadastro_corresponde(public.cadastros, jsonb),
  public.listar_cadastros(jsonb, integer), public.atribuir_vendedor(text, uuid[], jsonb) from public, anon;
grant execute on function public.cadastro_corresponde(public.cadastros, jsonb),
  public.listar_cadastros(jsonb, integer), public.atribuir_vendedor(text, uuid[], jsonb) to authenticated;
