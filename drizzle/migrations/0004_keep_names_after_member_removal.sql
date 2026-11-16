alter table public.project_tasks add column completed_by_name text;
alter table public.project_blockers add column created_by_name text;

-- Backfill (bypass the task guard; only the snapshot column changes).
select set_config('app.internal', 'on', true);
update public.project_tasks t set completed_by_name = p.display_name
from public.profiles p where p.id = t.completed_by;
select set_config('app.internal', 'off', true);
update public.project_blockers b set created_by_name = p.display_name
from public.profiles p where p.id = b.created_by;

grant select (completed_by_name) on public.project_tasks to authenticated;

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
    new.completed_by_name := null;
    return new;
  elsif tg_op = 'DELETE' then
    if coalesce(is_locked, false) then raise exception '%', locked_msg; end if;
    return old;
  end if;

  if new.project_id <> old.project_id then
    raise exception 'Operação inválida.';
  end if;
  if coalesce(is_locked, false) and (new.title <> old.title or new.position <> old.position) then
    raise exception '%', locked_msg;
  end if;

  if old.completed_at is null and new.completed_at is not null then
    new.completed_at := now();
    new.completed_by := auth.uid();
    new.completed_by_name := (select display_name from public.profiles where id = auth.uid());
  elsif old.completed_at is not null and new.completed_at is null then
    if not public.has_role(auth.uid(), 'gestor') then
      raise exception 'Somente gestores podem desmarcar uma tarefa concluída.';
    end if;
    new.completed_by := null;
    new.completed_by_name := null;
  else
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
    new.completed_by_name := old.completed_by_name;
  end if;
  return new;
end $$;

create or replace function public.stamp_blocker_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_name := (select display_name from public.profiles where id = new.created_by);
  else
    new.created_by_name := old.created_by_name;
  end if;
  return new;
end $$;
revoke execute on function public.stamp_blocker_author() from public, anon, authenticated;
create trigger project_blockers_stamp_author before insert or update on public.project_blockers
  for each row execute function public.stamp_blocker_author();

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

  insert into public.project_tasks (project_id, title, position, completed_at, completed_by, completed_by_name)
  select _id, t.title, t.position, t.completed_at, t.completed_by, t.completed_by_name
  from public.project_tasks t where t.project_id = _project_id;
  perform set_config('app.internal', 'off', true);
  return _id;
end $$;
revoke execute on function public.duplicate_project(uuid) from public, anon;
grant execute on function public.duplicate_project(uuid) to authenticated;