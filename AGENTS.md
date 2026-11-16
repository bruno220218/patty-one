<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Persistence goes through repository interfaces in `src/lib/data/repositories.ts`, implemented on Lovable Cloud (`cloud-*.ts`) and exported from `src/lib/data/index.ts`; UI never queries the database directly — why: storage stays swappable without UI changes.
- Security-relevant task rules (copying checklist tasks, fixed-params lock, who/when completed, gestor-only uncheck) are enforced in the database (RPCs `create_project`/`duplicate_project`, trigger `guard_project_tasks`, column grants), checked by `tests/db/task-rules.check.sql`; pure display rules live in `src/lib/data/rules.ts` with `data-rules.test.ts` — why: the UI can't be trusted to enforce permissions.
- Roles live in `user_roles`: any role (`membro`/`gestor`) means an approved team member (`is_team_member`), which every project/task/blocker/profile policy requires; new sign-ups get no role until a gestor approves them in Equipe; gestor-only pages sit under `src/routes/_authenticated/_gestor/` — why: sign-up is open, so an account alone must not unlock team data, and roles must never come from client state.
- Removing a team member deletes their account via the gestor-checked server function `src/lib/data/team.functions.ts` (admin client loaded inside the handler); task completions and blockers keep a name snapshot (`completed_by_name`/`created_by_name`, set by DB triggers) — why: history of who did what must survive removal.
- UI reads data with TanStack Query hooks from `src/hooks/use-data.ts` (client-side only, no route loaders) and mutates through `useDataAction` — why: the session lives in the browser and signed-in routes render client-side.
- AI next-step suggestions stream from the server route `src/routes/api/next-steps.ts` → `src/lib/ai/next-steps.server.ts` (Lovable AI Gateway, Responses API); the route verifies the caller's bearer token and the browser sends a project snapshot — why: keeps the key and prompt on the server and AI use limited to signed-in people.
