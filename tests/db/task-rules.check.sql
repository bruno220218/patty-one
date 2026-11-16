-- Self-checking test of the database task rules. Run it as one statement against the
-- backend: it always ends with an exception "RESULT: ..." so every change is rolled back.
-- Expected: g_gestor=true w_gestor=false tasks=2 locked=true addLocked=blocked
-- directInsert=blocked w_sees_checklists=0 completed_by_w=true w_uncheck=blocked
-- w_unlock=blocked spoofBy=blocked dupKeepsDone=1 dupLocked=true g_uncheck=true
-- deleteLocked=ok anonRead=blocked
-- (Assumes no gestor exists yet; on a populated database the first test user is not gestor.)
do $$
declare g uuid := gen_random_uuid(); w uuid := gen_random_uuid(); c uuid; p uuid; p2 uuid; t1 uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values (g, 'gestor-test@example.com', '{"display_name":"Gestora Teste"}', 'authenticated','authenticated');
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values (w, 'op-test@example.com', '{"display_name":"Operador Teste"}', 'authenticated','authenticated');
  out := out || 'g_gestor=' || public.has_role(g,'gestor') || ' w_gestor=' || public.has_role(w,'gestor');
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  insert into checklists(name, fixed_params) values ('CL', true) returning id into c;
  insert into checklist_tasks(checklist_id,title,position) values (c,'A',1),(c,'B',2);
  p := public.create_project('P', '', null, c);
  out := out || ' tasks=' || (select count(*) from project_tasks where project_id=p) || ' locked=' || (select locked from projects where id=p);
  begin insert into project_tasks(project_id,title,position) values (p,'X',3); out := out||' addLocked=ALLOWED'; exception when others then out := out||' addLocked=blocked'; end;
  begin insert into projects(name) values ('direct'); out := out||' directInsert=ALLOWED'; exception when others then out := out||' directInsert=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role','authenticated')::text, true);
  out := out || ' w_sees_checklists=' || (select count(*) from checklists);
  select id into t1 from project_tasks where project_id=p and title='A';
  update project_tasks set completed_at = now() where id=t1;
  out := out || ' completed_by_w=' || ((select completed_by from project_tasks where id=t1) = w);
  begin update project_tasks set completed_at = null where id=t1; out:=out||' w_uncheck=ALLOWED'; exception when others then out:=out||' w_uncheck=blocked'; end;
  begin update projects set locked=false where id=p; out:=out||' w_unlock=ALLOWED'; exception when others then out:=out||' w_unlock=blocked'; end;
  begin update project_tasks set completed_by=g where id=t1; out:=out||' spoofBy=ALLOWED'; exception when others then out:=out||' spoofBy=blocked'; end;
  p2 := public.duplicate_project(p);
  out := out || ' dupKeepsDone=' || (select count(*) from project_tasks where project_id=p2 and completed_by=w) || ' dupLocked=' || (select locked from projects where id=p2);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role','authenticated')::text, true);
  update project_tasks set completed_at = null where id=t1;
  out := out || ' g_uncheck=' || ((select completed_at from project_tasks where id=t1) is null);
  begin delete from projects where id=p; out:=out||' deleteLocked=ok'; exception when others then out:=out||' deleteLocked=ERR:'||sqlerrm; end;
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform count(*) from projects; out:=out||' anonRead=ALLOWED'; exception when others then out:=out||' anonRead=blocked'; end;
  raise exception 'RESULT: %', out;
end $$;
