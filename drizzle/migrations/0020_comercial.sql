-- ============ Comercial (vindo do PattyOne) ============
-- Propostas comerciais e pedidos de venda das empresas do grupo, com itens (Mídia OOH,
-- Produção, Serviço, Item livre), PDF e conversão proposta → pedido; histórico comercial
-- importado do SIGE (somente leitura).
--
-- Quem pode o quê:
--   - toda a equipe aprovada vê (is_team_member)
--   - comercial e gestão criam e editam propostas/pedidos e geram pedido  → can_vender
--   - só a gestão exclui documentos e importa o histórico do SIGE
-- A ordem de produção passa a apontar para o pedido (venda_id com chave estrangeira).
-- Rode depois da 0019. Pode rodar mais de uma vez.

-- ---------- 1) Permissão ----------
create or replace function public.can_vender(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial'])
$$;
revoke execute on function public.can_vender(uuid) from public, anon;
grant execute on function public.can_vender(uuid) to authenticated, service_role;

-- ---------- 2) Empresas do grupo ----------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) > 0),
  cnpj text,
  created_at timestamptz not null default now()
);
insert into public.empresas (nome) values
  ('GV Serviços de Colagem e Manutenção de Painéis'), ('Patty Painéis'), ('Patty Comercial'), ('Vilana')
on conflict (nome) do nothing;

alter table public.empresas enable row level security;
revoke all on public.empresas from public, anon;
grant select, insert, update on public.empresas to authenticated;
grant all on public.empresas to service_role;
drop policy if exists empresas_select on public.empresas;
drop policy if exists empresas_gestao on public.empresas;
drop policy if exists empresas_update on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy empresas_gestao on public.empresas for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['gestor']));
create policy empresas_update on public.empresas for update to authenticated
  using (public.has_any_role(auth.uid(), array['gestor']))
  with check (public.has_any_role(auth.uid(), array['gestor']));

-- ---------- 3) Propostas e pedidos ----------
create sequence if not exists public.vendas_numero_proposta_seq;
create sequence if not exists public.vendas_numero_pedido_seq;
revoke all on sequence public.vendas_numero_proposta_seq, public.vendas_numero_pedido_seq from public, anon;
grant usage on sequence public.vendas_numero_proposta_seq, public.vendas_numero_pedido_seq to authenticated;

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('proposta', 'pedido')),
  numero integer,
  empresa_id uuid not null references public.empresas (id),
  cadastro_id uuid not null references public.cadastros (id),
  vendedor text,
  status text not null,
  validade date,
  condicoes_pagamento text,
  observacao text,
  desconto numeric not null default 0 check (desconto >= 0),
  proposta_id uuid references public.vendas (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendas_status_valido check (
    (tipo = 'proposta' and status in ('Rascunho', 'Enviada', 'Aprovada', 'Recusada')) or
    (tipo = 'pedido' and status in ('Aberto', 'Em andamento', 'Concluído', 'Cancelado')))
);
create unique index if not exists vendas_tipo_numero_uniq on public.vendas (tipo, numero);
create unique index if not exists vendas_proposta_uniq on public.vendas (proposta_id) where proposta_id is not null;
create index if not exists vendas_cadastro_idx on public.vendas (cadastro_id);
create index if not exists vendas_tipo_status_idx on public.vendas (tipo, status);

create or replace function public.vendas_numerar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.numero is null then
    new.numero := case when new.tipo = 'proposta'
      then nextval('public.vendas_numero_proposta_seq')
      else nextval('public.vendas_numero_pedido_seq') end;
  end if;
  return new;
end;
$$;
drop trigger if exists vendas_numerar on public.vendas;
create trigger vendas_numerar before insert on public.vendas
  for each row execute function public.vendas_numerar();
drop trigger if exists vendas_touch on public.vendas;
create trigger vendas_touch before update on public.vendas
  for each row execute function public.touch_updated_at();

create table if not exists public.vendas_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  ordem integer not null default 0,
  categoria text not null check (categoria in ('Mídia OOH', 'Produção', 'Serviço', 'Item livre')),
  descricao text not null check (length(btrim(descricao)) > 0),
  ponto text,
  periodo_inicio date,
  periodo_fim date,
  quantidade numeric not null default 1 check (quantidade > 0),
  valor_unitario numeric not null default 0 check (valor_unitario >= 0),
  desconto numeric not null default 0 check (desconto >= 0),
  constraint vendas_itens_periodo check (periodo_fim is null or periodo_inicio is null or periodo_fim >= periodo_inicio)
);
create index if not exists vendas_itens_venda_idx on public.vendas_itens (venda_id, ordem);

alter table public.vendas enable row level security;
alter table public.vendas_itens enable row level security;
revoke all on public.vendas, public.vendas_itens from public, anon;
grant select, insert, update, delete on public.vendas, public.vendas_itens to authenticated;
grant all on public.vendas, public.vendas_itens to service_role;

drop policy if exists vendas_select on public.vendas;
drop policy if exists vendas_insert on public.vendas;
drop policy if exists vendas_update on public.vendas;
drop policy if exists vendas_delete on public.vendas;
create policy vendas_select on public.vendas for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy vendas_insert on public.vendas for insert to authenticated
  with check (public.can_vender(auth.uid()));
create policy vendas_update on public.vendas for update to authenticated
  using (public.can_vender(auth.uid())) with check (public.can_vender(auth.uid()));
create policy vendas_delete on public.vendas for delete to authenticated
  using (public.has_any_role(auth.uid(), array['gestor']));

drop policy if exists vendas_itens_select on public.vendas_itens;
drop policy if exists vendas_itens_insert on public.vendas_itens;
drop policy if exists vendas_itens_update on public.vendas_itens;
drop policy if exists vendas_itens_delete on public.vendas_itens;
create policy vendas_itens_select on public.vendas_itens for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy vendas_itens_insert on public.vendas_itens for insert to authenticated
  with check (public.can_vender(auth.uid()));
create policy vendas_itens_update on public.vendas_itens for update to authenticated
  using (public.can_vender(auth.uid())) with check (public.can_vender(auth.uid()));
create policy vendas_itens_delete on public.vendas_itens for delete to authenticated
  using (public.can_vender(auth.uid()));

-- ---------- 4) Salvar (cabeçalho + itens de uma vez) ----------
-- Roda com as permissões de quem chama (RLS vale). O tipo não muda depois de criado.
create or replace function public.salvar_venda(dados jsonb, venda_uuid uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_tipo text;
  item jsonb;
  i integer := 0;
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
    delete from public.vendas_itens where venda_id = v_id;
  end if;
  for item in select * from jsonb_array_elements(dados->'itens') loop
    i := i + 1;
    if coalesce(btrim(item->>'descricao'), '') = '' then
      raise exception 'Item % sem descrição', i;
    end if;
    insert into public.vendas_itens (venda_id, ordem, categoria, descricao, ponto, periodo_inicio,
      periodo_fim, quantidade, valor_unitario, desconto)
    values (v_id, i, item->>'categoria', btrim(item->>'descricao'), nullif(btrim(item->>'ponto'), ''),
      nullif(item->>'periodo_inicio', '')::date, nullif(item->>'periodo_fim', '')::date,
      coalesce((item->>'quantidade')::numeric, 1), coalesce((item->>'valor_unitario')::numeric, 0),
      coalesce((item->>'desconto')::numeric, 0));
  end loop;
  return v_id;
end;
$$;
revoke all on function public.salvar_venda(jsonb, uuid) from public, anon;
grant execute on function public.salvar_venda(jsonb, uuid) to authenticated;

-- ---------- 5) Proposta → pedido (aprova a proposta e copia os itens) ----------
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
  return novo;
end;
$$;
revoke all on function public.converter_proposta(uuid) from public, anon;
grant execute on function public.converter_proposta(uuid) to authenticated;

-- ---------- 6) Ordem de produção → pedido ----------
-- Antes não havia a tabela; vínculos que não apontam para um pedido existente são limpos.
update public.ordens_producao o set venda_id = null
 where venda_id is not null and not exists (select 1 from public.vendas v where v.id = o.venda_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordens_producao_venda_fk') then
    alter table public.ordens_producao add constraint ordens_producao_venda_fk
      foreign key (venda_id) references public.vendas (id) on delete set null;
  end if;
end;
$$;

-- ---------- 7) Histórico comercial do SIGE (somente leitura) ----------
create table if not exists public.historico_comercial_sige (
  id uuid primary key default gen_random_uuid(),
  chave_sige text not null unique,
  tipo text not null check (tipo in ('proposta', 'contrato', 'reserva')),
  numero_sige text not null,
  autorizacao_sige text,
  contrato_sige text,
  proposta_numero_sige text,
  cliente_nome text not null,
  cadastro_id uuid references public.cadastros (id) on delete set null,
  empresa_nome text,
  empresa_id uuid references public.empresas (id) on delete set null,
  empresa_origem text check (empresa_origem in ('arquivo', 'proposta')),
  data_documento date not null,
  valor numeric not null check (valor >= 0),
  valor_liquido numeric check (valor_liquido >= 0),
  vendedor text,
  status_sige text not null,
  tipo_servico text,
  fontes jsonb not null default '[]'::jsonb,
  dados_sige jsonb not null,
  importado_em timestamptz not null default now()
);
create index if not exists historico_comercial_data_idx on public.historico_comercial_sige (data_documento desc, numero_sige);
create index if not exists historico_comercial_cliente_idx on public.historico_comercial_sige (cadastro_id);
create index if not exists historico_comercial_tipo_idx on public.historico_comercial_sige (tipo);
comment on table public.historico_comercial_sige is
  'Arquivo comercial do SIGE, somente leitura. Contratos e reservas se juntam pela autorização.';

alter table public.historico_comercial_sige enable row level security;
revoke all on public.historico_comercial_sige from public, anon;
grant select on public.historico_comercial_sige to authenticated;
grant all on public.historico_comercial_sige to service_role;
drop policy if exists historico_comercial_select on public.historico_comercial_sige;
create policy historico_comercial_select on public.historico_comercial_sige for select to authenticated
  using (public.is_team_member(auth.uid()));

-- Importação (só gestão, lotes de até 500). Liga ao cadastro e à empresa quando o nome
-- corresponde a exatamente um registro.
create or replace function public.importar_historico_comercial_sige(linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; cid uuid; eid uuid; nc integer; ne integer; chave text;
  inseridos integer := 0; atualizados integer := 0;
begin
  if not public.has_any_role(auth.uid(), array['gestor']) then
    raise exception 'Só a gestão importa o histórico do SIGE' using errcode = '42501';
  end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) > 500 then
    raise exception 'Envie até 500 registros';
  end if;
  for r in select value from jsonb_array_elements(linhas) loop
    chave := r->>'chave_sige';
    if chave is null or chave <> (case when r->>'tipo' = 'proposta' then 'proposta:' else 'autorizacao:' end
                                  || (r->>'numero_sige')) then
      raise exception 'Identificação SIGE inválida';
    end if;
    select count(*), (array_agg(id))[1] into nc, cid from public.cadastros
     where upper(btrim(nome)) = upper(btrim(r->>'cliente_nome'));
    if nc <> 1 then cid := null; end if;
    select count(*), (array_agg(id))[1] into ne, eid from public.empresas
     where upper(btrim(nome)) = upper(btrim(case r->>'empresa_nome'
       when 'PATTY PAINEIS LTDA' then 'Patty Painéis'
       when 'PATTY COMERCIAL' then 'Patty Comercial'
       else r->>'empresa_nome' end));
    if ne <> 1 then eid := null; end if;
    if exists (select 1 from public.historico_comercial_sige where chave_sige = chave) then
      atualizados := atualizados + 1;
    else
      inseridos := inseridos + 1;
    end if;
    insert into public.historico_comercial_sige (chave_sige, tipo, numero_sige, autorizacao_sige,
      contrato_sige, proposta_numero_sige, cliente_nome, cadastro_id, empresa_nome, empresa_id,
      empresa_origem, data_documento, valor, valor_liquido, vendedor, status_sige, tipo_servico,
      fontes, dados_sige)
    values (chave, r->>'tipo', r->>'numero_sige', r->>'autorizacao_sige', r->>'contrato_sige',
      r->>'proposta_numero_sige', r->>'cliente_nome', cid, r->>'empresa_nome', eid,
      r->>'empresa_origem', (r->>'data_documento')::date, (r->>'valor')::numeric,
      (r->>'valor_liquido')::numeric, r->>'vendedor', r->>'status_sige', r->>'tipo_servico',
      coalesce(r->'fontes', '[]'::jsonb), coalesce(r->'dados_sige', '{}'::jsonb))
    on conflict (chave_sige) do update set tipo = excluded.tipo, numero_sige = excluded.numero_sige,
      autorizacao_sige = excluded.autorizacao_sige, contrato_sige = excluded.contrato_sige,
      proposta_numero_sige = excluded.proposta_numero_sige, cliente_nome = excluded.cliente_nome,
      cadastro_id = excluded.cadastro_id, empresa_nome = excluded.empresa_nome,
      empresa_id = excluded.empresa_id, empresa_origem = excluded.empresa_origem,
      data_documento = excluded.data_documento, valor = excluded.valor,
      valor_liquido = excluded.valor_liquido, vendedor = excluded.vendedor,
      status_sige = excluded.status_sige, tipo_servico = excluded.tipo_servico,
      fontes = excluded.fontes, dados_sige = excluded.dados_sige, importado_em = now();
  end loop;
  return jsonb_build_object('inseridos', inseridos, 'atualizados', atualizados);
end;
$$;
revoke all on function public.importar_historico_comercial_sige(jsonb) from public, anon;
grant execute on function public.importar_historico_comercial_sige(jsonb) to authenticated;
