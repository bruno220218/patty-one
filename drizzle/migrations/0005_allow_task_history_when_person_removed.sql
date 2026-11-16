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
    new.completed_by_name := old.completed_by_name;
    -- The completer's account was removed: let the link clear, keep the name.
    if not (new.completed_by is null and old.completed_by is not null
            and not exists (select 1 from public.profiles where id = old.completed_by)) then
      new.completed_by := old.completed_by;
    end if;
  end if;
  return new;
end $$;