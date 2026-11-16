
-- ============ Roles & profiles ============
create type public.app_role as enum ('gestor');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Signed-in users can read profiles" on public.profiles
  for select to authenticated using (true);
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

create policy "Read own roles; gestores read all" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'gestor'));
create policy "Gestores grant roles" on public.user_roles
  for insert to authenticated with check (public.has_role(auth.uid(), 'gestor'));
create policy "Gestores revoke roles" on public.user_roles
  for delete to authenticated using (public.has_role(auth.uid(), 'gestor'));

create or replace function public.prevent_last_gestor_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role = 'gestor' and not exists (
    select 1 from public.user_roles where role = 'gestor' and id <> old.id
  ) then
    raise exception 'É preciso manter pelo menos uma pessoa gestora.';
  end if;
  return old;
end $$;
create trigger user_roles_keep_one_gestor before delete on public.user_roles
  for each row execute function public.prevent_last_gestor_removal();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;

  if not exists (select 1 from public.user_roles where role = 'gestor') then
    insert into public.user_roles (user_id, role) values (new.id, 'gestor')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============ Checklists (gestores only) ============
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  fixed_params boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.checklists to authenticated;
grant all on public.checklists to service_role;
alter table public.checklists enable row level security;
create policy "Gestores manage checklists" on public.checklists
  for all to authenticated
  using (public.has_role(auth.uid(), 'gestor'))
  with check (public.has_role(auth.uid(), 'gestor'));
create trigger checklists_touch before update on public.checklists
  for each row execute function public.touch_updated_at();

create table public.checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index checklist_tasks_checklist_idx on public.checklist_tasks (checklist_id, position);
grant select, insert, update, delete on public.checklist_tasks to authenticated;
grant all on public.checklist_tasks to service_role;
alter table public.checklist_tasks enable row level security;
create policy "Gestores manage checklist tasks" on public.checklist_tasks
  for all to authenticated
  using (public.has_role(auth.uid(), 'gestor'))
  with check (public.has_role(auth.uid(), 'gestor'));

-- ============ Projects ============
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  due_date date,
  source_checklist_id uuid references public.checklists(id) on delete set null,
  locked boolean not null default false,
  archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Creation and duplication go through functions; "locked" is never client-writable.
grant select, delete on public.projects to authenticated;
grant update (name, description, due_date, archived, archived_at) on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "Signed-in users read projects" on public.projects
  for select to authenticated using (true);
create policy "Signed-in users update projects" on public.projects
  for update to authenticated using (true) with check (true);
create policy "Signed-in users delete projects" on public.projects
  for delete to authenticated using (true);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  position integer not null default 0,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_tasks_project_idx on public.project_tasks (project_id, position);
grant select, delete on public.project_tasks to authenticated;
grant insert (project_id, title, position) on public.project_tasks to authenticated;
grant update (title, position, completed_at) on public.project_tasks to authenticated;
grant all on public.project_tasks to service_role;
alter table public.project_tasks enable row level security;
create policy "Signed-in users read project tasks" on public.project_tasks
  for select to authenticated using (true);
create policy "Signed-in users add project tasks" on public.project_tasks
  for insert to authenticated with check (true);
create policy "Signed-in users update project tasks" on public.project_tasks
  for update to authenticated using (true) with check (true);
create policy "Signed-in users delete project tasks" on public.project_tasks
  for delete to authenticated using (true);

create or replace function public.guard_project_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_locked boolean;
  locked_msg constant text := 'Este projeto tem parâmetros fixos: as tarefas não podem ser alteradas.';
begin
  if coalesce(current_setting('app.internal', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  select p.locked into is_locked from public.projects p
  where p.id = coalesce(new.project_id, old.project_id);

  if tg_op = 'INSERT' then
    if coalesce(is_locked, false) then raise exception '%', locked_msg; end if;
    new.completed_at := null;
    new.completed_by := null;
    return new;
  elsif tg_op = 'DELETE' then
    if coalesce(is_locked, false) then raise exception '%', locked_msg; end if;
    return old;
  end if;

  -- UPDATE
  if new.project_id <> old.project_id then
    raise exception 'Operação inválida.';
  end if;
  if coalesce(is_locked, false) and (new.title <> old.title or new.position <> old.position) then
    raise exception '%', locked_msg;
  end if;

  if old.completed_at is null and new.completed_at is not null then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif old.completed_at is not null and new.completed_at is null then
    if not public.has_role(auth.uid(), 'gestor') then
      raise exception 'Somente gestores podem desmarcar uma tarefa concluída.';
    end if;
    new.completed_by := null;
  else
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;
  return new;
end $$;
create trigger project_tasks_guard before insert or update or delete on public.project_tasks
  for each row execute function public.guard_project_tasks();

create table public.project_blockers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null check (length(trim(description)) > 0 and length(description) <= 2000),
  suggestion text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index project_blockers_project_idx on public.project_blockers (project_id, created_at desc);
grant select, delete on public.project_blockers to authenticated;
grant insert (project_id, description) on public.project_blockers to authenticated;
grant update (suggestion, resolved_at) on public.project_blockers to authenticated;
grant all on public.project_blockers to service_role;
alter table public.project_blockers enable row level security;
create policy "Signed-in users read blockers" on public.project_blockers
  for select to authenticated using (true);
create policy "Signed-in users add blockers" on public.project_blockers
  for insert to authenticated with check (true);
create policy "Signed-in users update blockers" on public.project_blockers
  for update to authenticated using (true) with check (true);
create policy "Signed-in users delete blockers" on public.project_blockers
  for delete to authenticated using (true);

-- ============ Project actions ============
create or replace function public.create_project(
  _name text, _description text, _due_date date, _checklist_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
  _locked boolean := false;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if coalesce(trim(_name), '') = '' then raise exception 'O nome do projeto é obrigatório.'; end if;

  if _checklist_id is not null then
    if not public.has_role(auth.uid(), 'gestor') then
      raise exception 'Somente gestores podem criar projetos a partir de checklists.';
    end if;
    select c.fixed_params into _locked from public.checklists c where c.id = _checklist_id;
    if not found then raise exception 'Checklist não encontrado.'; end if;
  end if;

  perform set_config('app.internal', 'on', true);
  insert into public.projects (name, description, due_date, source_checklist_id, locked, created_by)
  values (trim(_name), coalesce(trim(_description), ''), _due_date, _checklist_id,
          coalesce(_locked, false), auth.uid())
  returning id into _id;

  if _checklist_id is not null then
    insert into public.project_tasks (project_id, title, position)
    select _id, ct.title, row_number() over (order by ct.position, ct.created_at)
    from public.checklist_tasks ct where ct.checklist_id = _checklist_id;
  end if;
  perform set_config('app.internal', 'off', true);
  return _id;
end $$;

create or replace function public.duplicate_project(_project_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
  src public.projects%rowtype;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  select * into src from public.projects where id = _project_id;
  if not found then raise exception 'Projeto não encontrado.'; end if;

  perform set_config('app.internal', 'on', true);
  insert into public.projects (name, description, due_date, source_checklist_id, locked, created_by)
  values (src.name || ' (cópia)', src.description, src.due_date, src.source_checklist_id,
          src.locked, auth.uid())
  returning id into _id;

  insert into public.project_tasks (project_id, title, position, completed_at, completed_by)
  select _id, t.title, t.position, t.completed_at, t.completed_by
  from public.project_tasks t where t.project_id = _project_id;
  perform set_config('app.internal', 'off', true);
  return _id;
end $$;

revoke execute on function public.create_project(text, text, date, uuid) from public, anon;
revoke execute on function public.duplicate_project(uuid) from public, anon;
grant execute on function public.create_project(text, text, date, uuid) to authenticated;
grant execute on function public.duplicate_project(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_project_tasks() from public, anon, authenticated;
revoke execute on function public.prevent_last_gestor_removal() from public, anon, authenticated;
