-- Self-checking test of migration 0025 (sem acesso anônimo). Run it as one statement after the
-- migrations: it always ends with an exception "RESULT: ..." so every change is rolled back.
-- It first recreates the production drift (anon reading tables and running functions, also via
-- PUBLIC), runs the 0025 rules again and checks that anon lost everything while signed-in people
-- kept what they had. Expected:
-- a_profiles=blocked a_liberacoes=blocked a_has_role=blocked a_nome=blocked a_avisar=blocked u_profiles=t u_has_role=t u_nome=t u_avisar=f u_lib_update=t g_profiles=1
do $$
declare g uuid := gen_random_uuid(); out text := '';
begin
  -- Drift as found in production on 20/11/2026.
  grant select on public.profiles, public.user_roles, public.liberacoes, public.notifications to anon;
  grant select on public.liberacoes to public;
  grant execute on function public.has_role(uuid, public.app_role), public.current_display_name() to anon;
  grant execute on function public.is_team_member(uuid), public.liberacao_editavel(uuid) to public;

  -- Same rules as migration 0025 (the file is idempotent; this repeats its blocks 1 and 2).
  revoke all on all tables in schema public from anon;
  revoke all on all sequences in schema public from anon;
  declare t record; p text; ta text[]; ts text[];
  begin
    for t in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f') loop
      continue when not (has_table_privilege('anon', t.oid, 'select') or has_table_privilege('anon', t.oid, 'insert')
                         or has_table_privilege('anon', t.oid, 'update') or has_table_privilege('anon', t.oid, 'delete'));
      ta := '{}'; ts := '{}';
      foreach p in array array['select', 'insert', 'update', 'delete'] loop
        if has_table_privilege('authenticated', t.oid, p) then ta := ta || p; end if;
        if has_table_privilege('service_role', t.oid, p) then ts := ts || p; end if;
      end loop;
      execute format('revoke all on public.%I from public', t.relname);
      if cardinality(ta) > 0 then execute format('grant %s on public.%I to authenticated', array_to_string(ta, ', '), t.relname); end if;
      if cardinality(ts) > 0 then execute format('grant %s on public.%I to service_role', array_to_string(ts, ', '), t.relname); end if;
    end loop;
  end;
  declare f record; fa boolean; fs boolean;
  begin
    for f in select p.oid, p.oid::regprocedure::text as s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind in ('f', 'p')
                and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e') loop
      fa := has_function_privilege('authenticated', f.oid, 'execute');
      fs := has_function_privilege('service_role', f.oid, 'execute');
      execute format('revoke execute on function %s from anon', f.s);
      if has_function_privilege('anon', f.oid, 'execute') then
        execute format('revoke execute on function %s from public', f.s);
        if fa then execute format('grant execute on function %s to authenticated', f.s); end if;
        if fs then execute format('grant execute on function %s to service_role', f.s); end if;
      end if;
    end loop;
  end;

  -- Anonymous visitor.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform count(*) from public.profiles; out := out || 'a_profiles=ALLOWED';
  exception when insufficient_privilege then out := out || 'a_profiles=blocked'; end;
  begin perform count(*) from public.liberacoes; out := out || ' a_liberacoes=ALLOWED';
  exception when insufficient_privilege then out := out || ' a_liberacoes=blocked'; end;
  begin perform public.has_role(g, 'gestor'); out := out || ' a_has_role=ALLOWED';
  exception when insufficient_privilege then out := out || ' a_has_role=blocked'; end;
  begin perform public.current_display_name(); out := out || ' a_nome=ALLOWED';
  exception when insufficient_privilege then out := out || ' a_nome=blocked'; end;
  begin perform public.avisar('{}'::uuid[], 'x', 'x', 0, '', ''); out := out || ' a_avisar=ALLOWED';
  exception when insufficient_privilege then out := out || ' a_avisar=blocked'; end;
  perform set_config('role', 'postgres', true);

  -- Signed-in people keep what they had (avisar stays internal-only).
  out := out || ' u_profiles=' || has_table_privilege('authenticated', 'public.profiles', 'select');
  out := out || ' u_has_role=' || has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'execute');
  out := out || ' u_nome=' || has_function_privilege('authenticated', 'public.current_display_name()', 'execute');
  out := out || ' u_avisar=' || has_function_privilege('authenticated', 'public.avisar(uuid[], text, text, integer, text, text)', 'execute');
  out := out || ' u_lib_update=' || has_table_privilege('authenticated', 'public.liberacoes', 'update');

  -- A gestor still reads the team.
  insert into auth.users (id, email) values (g, 'g-anon@example.com');
  insert into public.user_roles (user_id, role) values (g, 'gestor') on conflict do nothing;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  out := out || ' g_profiles=' || (select count(*) from public.profiles where id = g);
  raise exception 'RESULT: %', out;
end $$;
