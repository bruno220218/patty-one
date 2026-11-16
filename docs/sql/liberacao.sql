-- Liberações (modelos Projetos e Mídia) + função "comercial".
-- Ver: qualquer pessoa aprovada na equipe. Criar/editar/excluir: gestão ou comercial.

-- 1) Nova função de equipe
alter type public.app_role add value if not exists 'comercial';

-- Quem pode ajustar liberações (usa texto para funcionar na mesma transação do "add value").
create or replace function public.can_edit_liberacoes(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role::text in ('gestor', 'comercial')
  )
$$;
revoke execute on function public.can_edit_liberacoes(uuid) from public, anon;
grant execute on function public.can_edit_liberacoes(uuid) to authenticated, service_role;

-- 2) Cabeçalho da liberação
create sequence if not exists public.liberacoes_numero_seq start 1;

create table if not exists public.liberacoes (
  id uuid primary key default gen_random_uuid(),
  modelo text not null check (modelo in ('projeto', 'midia')),
  numero integer not null unique default nextval('public.liberacoes_numero_seq'),
  cliente text not null default '',
  vendedor text not null default '',
  projetista text not null default '',
  data_liberacao date,
  data_entrega date,
  -- Modelo Projetos
  responsavel text not null default '',
  telefone text not null default '',
  endereco text not null default '',
  -- Modelo Mídia
  bissemana text not null default '',
  numero_placa text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.liberacoes_numero_seq owned by public.liberacoes.numero;

create trigger liberacoes_touch before update on public.liberacoes
  for each row execute function public.touch_updated_at();

-- 3) Itens (SERVIÇO | MATERIAL | ACABAMENTO | INSTALAÇÃO | DETALHES | TAMANHO (CM) L x A | CHECK)
create table if not exists public.liberacao_itens (
  id uuid primary key default gen_random_uuid(),
  liberacao_id uuid not null references public.liberacoes(id) on delete cascade,
  position integer not null default 0,
  servico text not null default '',
  material text not null default '',
  acabamento text not null default '',
  instalacao text not null default '',
  detalhes text not null default '',
  largura_cm numeric(10, 2),
  altura_cm numeric(10, 2),
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists liberacao_itens_liberacao_idx
  on public.liberacao_itens (liberacao_id, position);

-- 4) Permissões
alter table public.liberacoes enable row level security;
alter table public.liberacao_itens enable row level security;

revoke all on public.liberacoes, public.liberacao_itens from anon;
grant select, insert, update, delete on public.liberacoes, public.liberacao_itens to authenticated;
grant usage, select on sequence public.liberacoes_numero_seq to authenticated;
grant all on public.liberacoes, public.liberacao_itens to service_role;

create policy "Equipe lê liberações" on public.liberacoes
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Gestão/comercial criam liberações" on public.liberacoes
  for insert to authenticated with check (public.can_edit_liberacoes(auth.uid()));
create policy "Gestão/comercial editam liberações" on public.liberacoes
  for update to authenticated
  using (public.can_edit_liberacoes(auth.uid()))
  with check (public.can_edit_liberacoes(auth.uid()));
create policy "Gestão/comercial excluem liberações" on public.liberacoes
  for delete to authenticated using (public.can_edit_liberacoes(auth.uid()));

create policy "Equipe lê itens de liberação" on public.liberacao_itens
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Gestão/comercial criam itens" on public.liberacao_itens
  for insert to authenticated with check (public.can_edit_liberacoes(auth.uid()));
create policy "Gestão/comercial editam itens" on public.liberacao_itens
  for update to authenticated
  using (public.can_edit_liberacoes(auth.uid()))
  with check (public.can_edit_liberacoes(auth.uid()));
create policy "Gestão/comercial excluem itens" on public.liberacao_itens
  for delete to authenticated using (public.can_edit_liberacoes(auth.uid()));
