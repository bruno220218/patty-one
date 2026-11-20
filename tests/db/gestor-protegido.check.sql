-- Self-checking test of migration 0030 (gestor protegido). Run it as one statement: it always
-- ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- tiraGestao=blocked tiraAcesso=blocked outraFuncao=ok membro=ok proprio=ok ultimo=blocked contaRemovida=0
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  out text := '';
begin
  insert into auth.users (id, email) values (a, 'a-gp@example.com'), (b, 'b-gp@example.com'),
    (m, 'm-gp@example.com');
  delete from user_roles where user_id in (a, b, m);
  -- Only these two gestores, so the "keep one gestor" rule can be checked too.
  delete from user_roles where role = 'gestor';
  insert into user_roles (user_id, role) values
    (a, 'gestor'), (b, 'gestor'), (b, 'comercial'), (m, 'membro');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  -- A takes away B's Gestão.
  begin delete from user_roles where user_id = b and role = 'gestor'; out := out || 'tiraGestao=ALLOWED';
  exception when insufficient_privilege then out := out || 'tiraGestao=blocked'; end;
  -- A turns off B's access (deletes every role of B).
  begin delete from user_roles where user_id = b; out := out || ' tiraAcesso=ALLOWED';
  exception when insufficient_privilege then out := out || ' tiraAcesso=blocked'; end;
  -- A changes B's other functions and a colaborador's access.
  begin delete from user_roles where user_id = b and role = 'comercial'; out := out || ' outraFuncao=ok';
  exception when others then out := out || ' outraFuncao=BLOCKED'; end;
  begin delete from user_roles where user_id = m; out := out || ' membro=ok';
  exception when others then out := out || ' membro=BLOCKED'; end;
  -- B leaves Gestão by themself; then A, the last gestor, can't leave.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin delete from user_roles where user_id = b and role = 'gestor'; out := out || ' proprio=ok';
  exception when others then out := out || ' proprio=BLOCKED'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin delete from user_roles where user_id = a and role = 'gestor'; out := out || ' ultimo=ALLOWED';
  exception when others then out := out || ' ultimo=blocked'; end;

  -- The server deleting an account (no signed-in user) still works.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into user_roles (user_id, role) values (b, 'gestor');
  delete from auth.users where id = b;
  out := out || ' contaRemovida=' || (select count(*) from user_roles where user_id = b);
  raise exception 'RESULT: %', out;
end $$;
