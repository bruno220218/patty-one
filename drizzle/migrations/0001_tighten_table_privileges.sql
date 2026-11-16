
revoke all on public.profiles, public.user_roles, public.checklists, public.checklist_tasks,
  public.projects, public.project_tasks, public.project_blockers from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.user_roles to authenticated;
grant select, insert, update, delete on public.checklists to authenticated;
grant select, insert, update, delete on public.checklist_tasks to authenticated;

grant select, delete on public.projects to authenticated;
grant update (name, description, due_date, archived, archived_at) on public.projects to authenticated;

grant select, delete on public.project_tasks to authenticated;
grant insert (project_id, title, position) on public.project_tasks to authenticated;
grant update (title, position, completed_at) on public.project_tasks to authenticated;

grant select, delete on public.project_blockers to authenticated;
grant insert (project_id, description) on public.project_blockers to authenticated;
grant update (suggestion, resolved_at) on public.project_blockers to authenticated;

revoke execute on function public.create_project(text, text, date, uuid) from public, anon;
revoke execute on function public.duplicate_project(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_project_tasks() from public, anon, authenticated;
revoke execute on function public.prevent_last_gestor_removal() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
