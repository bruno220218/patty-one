-- ============ Registro de quem definiu a senha de quem (tela Equipe) ============
-- A gestão pode definir a senha de um colaborador e, com ela, entrar como essa pessoa.
-- Cada vez que isso acontece fica um registro: quem definiu, de quem, quando.
-- Só o servidor grava (com a chave de serviço, depois de conferir que é gestão); ninguém
-- grava, altera ou apaga pelo app. Só a gestão lê. Os nomes e o e-mail ficam guardados no
-- registro, então ele continua legível mesmo se a conta for removida depois.
-- Rode depois da 0025 (não depende da 0026, do Financeiro). Pode rodar mais de uma vez.

create table if not exists public.equipe_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('senha_definida')),
  alvo_id uuid references public.profiles (id) on delete set null,
  alvo_nome text not null default '',
  alvo_email text not null default '',
  autor_id uuid references public.profiles (id) on delete set null,
  autor_nome text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists equipe_eventos_alvo_idx on public.equipe_eventos (alvo_id, created_at desc);

alter table public.equipe_eventos enable row level security;
revoke all on public.equipe_eventos from public, anon, authenticated;
grant select on public.equipe_eventos to authenticated;
grant all on public.equipe_eventos to service_role;

drop policy if exists "Gestão lê os eventos da equipe" on public.equipe_eventos;
create policy "Gestão lê os eventos da equipe" on public.equipe_eventos
  for select to authenticated using (public.has_role(auth.uid(), 'gestor'));
