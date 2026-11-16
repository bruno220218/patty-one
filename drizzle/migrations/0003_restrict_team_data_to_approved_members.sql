-- Approved team members: anyone holding a role (membro or gestor). New sign-ups have none
-- until a gestor approves them, so open sign-up no longer grants access to team data.
create or replace function public.is_team_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;
revoke execute on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated, service_role;

-- Backfill: everyone who already has an account keeps access.
insert into public.user_roles (user_id, role)
select p.id, 'membro'::public.app_role from public.profiles p
where not exists (select 1 from public.user_roles r where r.user_id = p.id)
on conflict do nothing;

-- Profiles: own profile always; other people's only for approved members.
drop policy if exists "Signed-in users can read profiles" on public.profiles;
create policy "Members read profiles; everyone reads own" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_team_member(auth.uid()));

-- Projects
drop policy if exists "Signed-in users read projects" on public.projects;
drop policy if exists "Signed-in users update projects" on public.projects;
drop policy if exists "Signed-in users delete projects" on public.projects;
create policy "Team members read projects" on public.projects
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team members update projects" on public.projects
  for update to authenticated
  using (public.is_team_member(auth.uid()))
  with check (public.is_team_member(auth.uid()));
create policy "Team members delete projects" on public.projects
  for delete to authenticated using (public.is_team_member(auth.uid()));

-- Project tasks
drop policy if exists "Signed-in users read project tasks" on public.project_tasks;
drop policy if exists "Signed-in users add project tasks" on public.project_tasks;
drop policy if exists "Signed-in users update project tasks" on public.project_tasks;
drop policy if exists "Signed-in users delete project tasks" on public.project_tasks;
create policy "Team members read project tasks" on public.project_tasks
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team members add project tasks" on public.project_tasks
  for insert to authenticated with check (public.is_team_member(auth.uid()));
create policy "Team members update project tasks" on public.project_tasks
  for update to authenticated
  using (public.is_team_member(auth.uid()))
  with check (public.is_team_member(auth.uid()));
create policy "Team members delete project tasks" on public.project_tasks
  for delete to authenticated using (public.is_team_member(auth.uid()));

-- Project blockers
drop policy if exists "Signed-in users read blockers" on public.project_blockers;
drop policy if exists "Signed-in users add blockers" on public.project_blockers;
drop policy if exists "Signed-in users update blockers" on public.project_blockers;
drop policy if exists "Signed-in users delete blockers" on public.project_blockers;
create policy "Team members read blockers" on public.project_blockers
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team members add own blockers" on public.project_blockers
  for insert to authenticated
  with check (public.is_team_member(auth.uid()) and created_by = auth.uid());
create policy "Team members update blockers" on public.project_blockers
  for update to authenticated
  using (public.is_team_member(auth.uid()))
  with check (public.is_team_member(auth.uid()));
create policy "Team members delete blockers" on public.project_blockers
  for delete to authenticated using (public.is_team_member(auth.uid()));

-- Project actions run with elevated rights, so they check membership themselves.
create or replace function public.create_project(
  _name text, _description text, _due_date date, _checklist_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
  _locked boolean := false;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if not public.is_team_member(auth.uid()) then
    raise exception 'Sua conta ainda não foi aprovada por um gestor.';
  end if;
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
  if not public.is_team_member(auth.uid()) then
    raise exception 'Sua conta ainda não foi aprovada por um gestor.';
  end if;
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