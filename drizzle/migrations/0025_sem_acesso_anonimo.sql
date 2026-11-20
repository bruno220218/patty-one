-- ============ Nada do banco para quem não entrou na conta (auditoria de 20/11/2026) ============
-- A chave pública do Supabase fica no navegador (é feita para isso). Sem login, ela usa o papel
-- "anon". Em produção esse papel ainda lia algumas tabelas (profiles, user_roles, liberacoes,
-- notifications: as regras por linha devolviam vazio) e rodava has_role, is_team_member,
-- liberacao_editavel e current_display_name, embora as migrações 0001/0006 tirem isso.
-- O app não usa o banco antes do login (entrar, criar conta e trocar senha são do Supabase Auth),
-- então "anon" perde tudo no schema public e as regras por linha deixam de ser a única barreira.
-- Quem está logado (authenticated) fica exatamente com o que tem hoje.
-- Rode depois da 0024. Pode rodar mais de uma vez.

-- ---------- 1) Tabelas, views e sequências ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Se "anon" ainda tiver acesso, ele vem de PUBLIC (todo mundo). Tira de PUBLIC e devolve a
-- authenticated/service_role o que eles tinham por esse caminho.
do $$
declare
  t record;
  p text;
  tinha_auth text[];
  tinha_svc text[];
begin
  for t in
    select c.oid, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
  loop
    if not (has_table_privilege('anon', t.oid, 'select')
            or has_table_privilege('anon', t.oid, 'insert')
            or has_table_privilege('anon', t.oid, 'update')
            or has_table_privilege('anon', t.oid, 'delete')) then
      continue;
    end if;
    tinha_auth := '{}';
    tinha_svc := '{}';
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege('authenticated', t.oid, p) then tinha_auth := tinha_auth || p; end if;
      if has_table_privilege('service_role', t.oid, p) then tinha_svc := tinha_svc || p; end if;
    end loop;
    execute format('revoke all on public.%I from public', t.relname);
    if cardinality(tinha_auth) > 0 then
      execute format('grant %s on public.%I to authenticated', array_to_string(tinha_auth, ', '), t.relname);
    end if;
    if cardinality(tinha_svc) > 0 then
      execute format('grant %s on public.%I to service_role', array_to_string(tinha_svc, ', '), t.relname);
    end if;
  end loop;
end $$;

-- ---------- 2) Funções ----------
-- Mesma ideia: tira de "anon"; se ainda sobrar por PUBLIC, tira de PUBLIC e devolve a
-- authenticated/service_role só se eles já podiam rodar. Funções de extensões ficam como estão.
do $$
declare
  f record;
  tinha_auth boolean;
  tinha_svc boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    tinha_auth := has_function_privilege('authenticated', f.oid, 'execute');
    tinha_svc := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from anon', f.assinatura);
    if has_function_privilege('anon', f.oid, 'execute') then
      execute format('revoke execute on function %s from public', f.assinatura);
      if tinha_auth then
        execute format('grant execute on function %s to authenticated', f.assinatura);
      end if;
      if tinha_svc then
        execute format('grant execute on function %s to service_role', f.assinatura);
      end if;
    end if;
  end loop;
end $$;

-- ---------- 3) O que for criado daqui para frente também nasce sem "anon" ----------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
