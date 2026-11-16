# Patty One — Roadmap

- [x] Shell: sidebar (desktop) / bottom bar (mobile), light/dark theme, pt-BR
- [x] Data access layer over localStorage (swappable for a database), unique IDs
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
- [ ] Bloqueios: describe a blocker on a project, AI suggests next steps from tasks/progress (Lovable AI)
- [ ] Record who completed each task; once checked it can't be unchecked except by someone with management permission (blocked: needs decision on how people are identified — real accounts vs local profile)
