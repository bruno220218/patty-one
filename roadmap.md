# Patty One — Roadmap

- [x] Shell: sidebar (desktop) / bottom bar (mobile), light/dark theme, pt-BR
- [x] Data access layer (now on Lovable Cloud), unique IDs
- [x] Checklists: create, edit, duplicate, delete (confirm), tasks add/edit/delete/reorder, task count, empty state
- [x] Projetos: "Novo projeto" from checklist or empty; name (required), description, optional due date
- [x] Rule: tasks copied from checklist with new IDs, all unchecked; projects and checklists independent afterwards
- [x] Project card: status, progress bar, done tasks, due date; edit, duplicate, archive, delete (confirm)
- [x] Arquivados: list archived projects, restore, delete
- [x] Project screen: name, description, status, progress % (0% with no tasks), checkbox tasks with completion timestamp, add/edit/delete/reorder tasks, back to projects
- [x] Tests for the business rules
- [x] Checklist option "Parâmetros fixos": projects created from it inherit a lock (tasks only checkable; name/description/due date still editable); badge on checklist card; toggling later doesn't affect existing projects
- [x] App name is "Patty One" (replaces Trilha) everywhere
- [x] Use Patty logo (uploaded PDF) in sidebar/mobile header + favicon
- [x] Bloqueios: describe a blocker on a project, AI suggests next steps from tasks/progress (Lovable AI)
- [x] Accounts with login (email/senha, Google, Lovable); first signup becomes gestor; Equipe page to grant gestão
- [x] Record who completed each task; once checked only a gestor can uncheck (enforced in database)
- [x] Checklists area visible only to gestores
- [x] Apply uploaded migration: liberações, approval flow, team functions
- [ ] Tela de gestão: charts of progress per project, per checklist, and blockers, for the team to see what is in progress (waiting on user go-ahead)
