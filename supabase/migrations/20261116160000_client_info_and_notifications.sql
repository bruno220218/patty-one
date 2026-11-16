-- 1) Informações do cliente nos projetos
-- 2) Notificações para gestores quando uma tarefa de projeto é concluída

-- ---------------------------------------------------------------------------
-- 1) Informações do cliente
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists service_type  text not null default '',
  add column if not exists led_color     text not null default '',
  add column if not exists paint_colors  text not null default '',
  add column if not exists adhesive_type text not null default '',
  -- null = não informado
  add column if not exists lamination    boolean;

-- Projects use column-level grants (e.g. `locked` is not client-writable), so the
-- new columns must be granted explicitly. RLS on projects still decides who may update.
grant update (service_type, led_color, paint_colors, adhesive_type, lamination)
  on public.projects to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Notificações
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  task_id       uuid references public.project_tasks (id) on delete set null,
  -- Snapshots so the history survives renames and removals.
  actor_name    text not null default '',
  project_name  text not null default '',
  task_title    text not null default '',
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

-- Rows are created only by the trigger below; people can read their own and mark them read.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Notifies every gestor (except the person who did it) when a task becomes completed.
create or replace function public.notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor_name   text;
  _project_name text;
begin
  if old.completed_at is not null or new.completed_at is null then
    return new;
  end if;

  select coalesce(nullif(new.completed_by_name, ''), p.display_name, 'Alguém da equipe')
    into _actor_name
    from (select 1) as one
    left join public.profiles p on p.id = new.completed_by;

  select name into _project_name from public.projects where id = new.project_id;

  insert into public.notifications (recipient_id, project_id, task_id, actor_name, project_name, task_title)
  select distinct r.user_id, new.project_id, new.id, _actor_name, coalesce(_project_name, ''), new.title
    from public.user_roles r
   where r.role = 'gestor'
     and r.user_id is distinct from new.completed_by;

  return new;
end;
$$;

revoke all on function public.notify_task_completed() from public, anon, authenticated;

drop trigger if exists project_tasks_notify_completed on public.project_tasks;
create trigger project_tasks_notify_completed
  after update of completed_at on public.project_tasks
  for each row
  execute function public.notify_task_completed();

-- Live updates for the bell (Realtime respects the RLS policies above).
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
