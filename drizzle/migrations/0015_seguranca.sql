-- ============ Segurança (auditoria de 18/11/2026) ============
-- 1) Tira das tabelas de liberação permissões que o app não usa (TRUNCATE apaga a
--    tabela inteira ignorando as regras por linha; REFERENCES/TRIGGER também sobram).
-- 2) Gestão vê o e-mail de cada conta na tela Equipe (para não aprovar um impostor
--    que se cadastrou com o nome de outra pessoa).
-- 3) Limite de uso da IA: só membros aprovados, no máximo 40 pedidos por pessoa por dia.
-- Pode rodar mais de uma vez.

-- ---------- 1) Permissões que sobravam ----------
revoke truncate, references, trigger on public.liberacoes, public.liberacao_itens,
  public.liberacao_eventos, public.liberacao_opcoes from authenticated, anon, public;

-- Nenhuma tabela do app precisa de TRUNCATE/REFERENCES/TRIGGER para quem usa o app.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, references, trigger on public.%I from authenticated, anon, public', t.tablename);
  end loop;
end $$;

-- ---------- 2) E-mail das contas (só gestão) ----------
create or replace function public.equipe_emails()
returns table (id uuid, email text) language sql stable security definer set search_path = public as $$
  select u.id, u.email::text
    from auth.users u
   where public.has_role(auth.uid(), 'gestor')
$$;
revoke execute on function public.equipe_emails() from public, anon;
grant execute on function public.equipe_emails() to authenticated;

-- ---------- 3) Limite de uso da IA ----------
create table if not exists public.ia_uso (
  user_id uuid not null references auth.users (id) on delete cascade,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  pedidos integer not null default 0,
  primary key (user_id, dia)
);
alter table public.ia_uso enable row level security;
revoke all on public.ia_uso from public, anon, authenticated;

-- Conta um pedido e diz se pode usar. Recusa quem não é membro aprovado da equipe.
create or replace function public.registrar_uso_ia()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_limite constant integer := 40;
  v_pedidos integer;
begin
  if auth.uid() is null or not public.is_team_member(auth.uid()) then
    return 'nao_membro';
  end if;
  insert into public.ia_uso (user_id, pedidos) values (auth.uid(), 1)
  on conflict (user_id, dia) do update set pedidos = public.ia_uso.pedidos + 1
  returning pedidos into v_pedidos;
  if v_pedidos > v_limite then
    return 'limite';
  end if;
  return 'ok';
end $$;
revoke execute on function public.registrar_uso_ia() from public, anon;
grant execute on function public.registrar_uso_ia() to authenticated;
