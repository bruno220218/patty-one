## Hospedagem e banco (sem Lovable)

- App hospedado na Cloudflare Workers (plano grátis); build com `bun run build`
  (nitro, preset `cloudflare-module`), deploy com `bun run deploy`.
- Banco/autenticação: projeto Supabase próprio (`dvndroghanmriumjfgqf`, plano grátis).
- Mudanças de esquema: escreva um novo arquivo em `drizzle/migrations/` e rode o SQL
  no SQL Editor do Supabase; depois regenere `src/integrations/supabase/types.ts`.
- Segredos (`SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`) ficam só no painel da
  Cloudflare, nunca no repositório. URL e chave publishable são públicas e ficam no `.env`.

## Project rules

- Persistence goes through repository interfaces in `src/lib/data/repositories.ts`, implemented on Supabase (`cloud-*.ts`) and exported from `src/lib/data/index.ts`; UI never queries the database directly — why: storage stays swappable without UI changes.
- Security-relevant task rules (copying checklist tasks, fixed-params lock, who/when completed, gestor-only uncheck) are enforced in the database (RPCs `create_project`/`duplicate_project`, trigger `guard_project_tasks`, column grants), checked by `tests/db/task-rules.check.sql`; pure display rules live in `src/lib/data/rules.ts` with `data-rules.test.ts` — why: the UI can't be trusted to enforce permissions.
- Roles live in `user_roles`: any role (`membro`/`gestor`) means an approved team member (`is_team_member`), which every project/task/blocker/profile policy requires; new sign-ups get no role until a gestor approves them in Equipe; gestor-only pages sit under `src/routes/_authenticated/_gestor/` — why: sign-up is open, so an account alone must not unlock team data, and roles must never come from client state.
- Removing a team member deletes their account via the gestor-checked server function `src/lib/data/team.functions.ts` (admin client loaded inside the handler); task completions and blockers keep a name snapshot (`completed_by_name`/`created_by_name`, set by DB triggers) — why: history of who did what must survive removal.
- UI reads data with TanStack Query hooks from `src/hooks/use-data.ts` (client-side only, no route loaders) and mutates through `useDataAction` — why: the session lives in the browser and signed-in routes render client-side.
- AI next-step suggestions stream from the server route `src/routes/api/next-steps.ts` → `src/lib/ai/next-steps.server.ts` (provedor compatível com OpenAI, opcional via `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL`); the route verifies the caller's bearer token and the browser sends a project snapshot — why: keeps the key and prompt on the server and AI use limited to signed-in people.
