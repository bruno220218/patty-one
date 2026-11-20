-- Self-checking test of migration 0027 (registro de quem definiu senha). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- g_le=1 m_le=0 m_grava=blocked g_grava=blocked g_apaga=0 anon_le=blocked alvoRemovido=1/Membro Log
do $$
declare g uuid := gen_random_uuid(); m uuid := gen_random_uuid(); out text := ''; n int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-log@example.com', '{"display_name":"Gestão Log"}'),
    (m, 'm-log@example.com', '{"display_name":"Membro Log"}');
  delete from user_roles where user_id in (g, m);
  insert into user_roles (user_id, role) values (g, 'gestor'), (m, 'membro');
  -- What the server writes (service role).
  insert into public.equipe_eventos (tipo, alvo_id, alvo_nome, alvo_email, autor_id, autor_nome)
  values ('senha_definida', m, 'Membro Log', 'm-log@example.com', g, 'Gestão Log');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  out := out || 'g_le=' || (select count(*) from public.equipe_eventos where alvo_id = m);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  out := out || ' m_le=' || (select count(*) from public.equipe_eventos);
  begin
    insert into public.equipe_eventos (tipo, alvo_id, autor_id) values ('senha_definida', g, m);
    out := out || ' m_grava=ALLOWED';
  exception when insufficient_privilege then out := out || ' m_grava=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  begin
    insert into public.equipe_eventos (tipo, alvo_id, autor_id) values ('senha_definida', m, g);
    out := out || ' g_grava=ALLOWED';
  exception when insufficient_privilege then out := out || ' g_grava=blocked'; end;
  begin
    delete from public.equipe_eventos where alvo_id = m;
    get diagnostics n = row_count;
    out := out || ' g_apaga=' || n;
  exception when insufficient_privilege then out := out || ' g_apaga=0'; end;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform count(*) from public.equipe_eventos; out := out || ' anon_le=ALLOWED';
  exception when insufficient_privilege then out := out || ' anon_le=blocked'; end;

  -- Removing the person keeps the record, with the saved name.
  perform set_config('role', 'postgres', true);
  delete from auth.users where id = m;
  out := out || ' alvoRemovido=' || (select count(*) || '/' || max(alvo_nome)
                                       from public.equipe_eventos where alvo_email = 'm-log@example.com');
  raise exception 'RESULT: %', out;
end $$;
