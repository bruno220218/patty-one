-- Self-checking test of migration 0015 (segurança). Run it as one statement: it always ends
-- with an exception "RESULT: ..." so every change is rolled back. Expected:
-- truncate=blocked g_emails=t m_emails=0 s_ia=nao_membro m_ia=ok m_ia41=limite s_lerUso=blocked
do $$
declare g uuid := gen_random_uuid(); m uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  out text := ''; r text; i int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-seg@example.com', '{"display_name":"Gestão Seg"}'),
    (m, 'm-seg@example.com', '{"display_name":"Membro Seg"}'),
    (s, 's-seg@example.com', '{"display_name":"Laila Souza"}');
  delete from user_roles where user_id in (m, s);
  insert into user_roles (user_id, role) values (g, 'gestor'), (m, 'membro') on conflict do nothing;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  begin truncate public.liberacoes cascade; out := out || 'truncate=ALLOWED';
  exception when others then out := out || 'truncate=blocked'; end;
  out := out || ' m_emails=' || (select count(*) from public.equipe_emails());
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  out := out || ' g_emails=' || ((select email from public.equipe_emails() where id = s) = 's-seg@example.com');
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  out := out || ' s_ia=' || public.registrar_uso_ia();
  begin perform count(*) from public.ia_uso; out := out || ' s_lerUso=ALLOWED';
  exception when others then out := out || ' s_lerUso=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  out := out || ' m_ia=' || public.registrar_uso_ia();
  for i in 2..40 loop r := public.registrar_uso_ia(); end loop;
  out := out || ' m_ia41=' || public.registrar_uso_ia();
  raise exception 'RESULT: %', out;
end $$;
