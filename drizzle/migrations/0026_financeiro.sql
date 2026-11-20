-- Financeiro vindo do PattyOne: contas a receber, contratos de aluguel dos pontos e contratos de
-- energia. Quem vê e edita: Gestão, Direção e Financeiro. Quem exclui: Gestão e Direção.
-- (Contas a pagar e comissões não existiam no PattyOne; ficam para uma etapa própria.)

-- ---------- 1) Permissões ----------
create or replace function public.can_financeiro(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'direcao', 'financeiro'])
$$;
create or replace function public.can_excluir_financeiro(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'direcao'])
$$;
revoke execute on function public.can_financeiro(uuid) from public, anon;
revoke execute on function public.can_excluir_financeiro(uuid) from public, anon;
grant execute on function public.can_financeiro(uuid) to authenticated, service_role;
grant execute on function public.can_excluir_financeiro(uuid) to authenticated, service_role;

-- ---------- 2) Tabelas ----------
create table if not exists public.contas_receber (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid references public.cadastros (id) on delete set null,
  venda_id uuid references public.vendas (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete set null,
  descricao text not null check (length(btrim(descricao)) > 0),
  vencimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'Aberto' check (status in ('Aberto', 'Recebido', 'Cancelado')),
  recebido_em date,
  observacao text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'Recebido') = (recebido_em is not null))
);
create index if not exists contas_receber_vencimento_idx on public.contas_receber (vencimento);
create index if not exists contas_receber_status_idx on public.contas_receber (status);
create index if not exists contas_receber_cadastro_idx on public.contas_receber (cadastro_id);
create index if not exists contas_receber_venda_idx on public.contas_receber (venda_id);

-- "Recebido" sem data vira hoje; voltar para Aberto/Cancelado limpa a data.
create or replace function public.normalizar_conta_receber()
returns trigger language plpgsql set search_path = public as $$
begin
  new.descricao := btrim(new.descricao);
  if new.status = 'Recebido' then
    new.recebido_em := coalesce(new.recebido_em, (now() at time zone 'America/Sao_Paulo')::date);
  else
    new.recebido_em := null;
  end if;
  return new;
end;
$$;
drop trigger if exists contas_receber_normalizar on public.contas_receber;
create trigger contas_receber_normalizar before insert or update on public.contas_receber
  for each row execute function public.normalizar_conta_receber();

create table if not exists public.contratos_aluguel (
  id uuid primary key default gen_random_uuid(),
  contrato text,
  proprietario text not null check (length(btrim(proprietario)) > 0),
  -- Códigos dos pontos de mídia separados por vírgula, como no SIGE ("062, 1040, 007").
  midias text,
  periodicidade text not null default 'Mensal' check (periodicidade in (
    'Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Sem recorrência')),
  vigencia date,
  vencimento date,
  valor numeric(14,2) not null default 0 check (valor >= 0),
  ativo boolean not null default true,
  validado boolean not null default false,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contratos_aluguel_vencimento_idx on public.contratos_aluguel (vencimento);

create table if not exists public.contratos_energia (
  id uuid primary key default gen_random_uuid(),
  num_cliente text,
  num_instalacao text,
  unidade text,
  data_inicio date,
  titular text,
  local text,
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(btrim(num_cliente), '') <> '' or coalesce(btrim(num_instalacao), '') <> ''
         or coalesce(btrim(local), '') <> '')
);

-- ---------- 3) Acesso ----------
do $$
declare t text;
begin
  foreach t in array array['contas_receber', 'contratos_aluguel', 'contratos_energia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
      using (public.can_financeiro(auth.uid()))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.can_financeiro(auth.uid()))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
      using (public.can_financeiro(auth.uid())) with check (public.can_financeiro(auth.uid()))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated
      using (public.can_excluir_financeiro(auth.uid()))', t);
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before update on public.%1$I
      for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;
