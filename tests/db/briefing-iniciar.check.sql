-- Self-checking test of migration 0017 (briefing "Iniciar" + entrega). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- novoSemInicio=t iniciado=t responsavel=t avisoCriador=1 avisoGestao=1 datafixa=t entregaAnexo=ok
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); cr uuid := gen_random_uuid();
  b uuid; inicio timestamptz; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-b@example.com', '{"display_name":"Gestão B"}'), (co, 'co-b@example.com', '{"display_name":"Comercial B"}'),
    (cr, 'cr-b@example.com', '{"display_name":"Criação B"}');
  delete from user_roles where user_id in (co, cr);
  insert into user_roles (user_id, role) values (g, 'gestor'), (co, 'comercial'), (cr, 'criacao') on conflict do nothing;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  insert into briefings (destino, titulo, cliente) values ('criacao', 'Fachada', 'Cliente B') returning id into b;
  out := out || 'novoSemInicio=' || ((select iniciado_em from briefings where id = b) is null);
  perform set_config('request.jwt.claims', json_build_object('sub', cr, 'role', 'authenticated')::text, true);
  update briefings set status = 'em_andamento' where id = b;
  select iniciado_em into inicio from briefings where id = b;
  out := out || ' iniciado=' || (inicio is not null)
             || ' responsavel=' || ((select responsavel_id from briefings where id = b) = cr);
  update briefings set iniciado_em = '2020-01-01' where id = b;
  out := out || ' datafixa=' || ((select iniciado_em from briefings where id = b) = inicio);
  begin
    insert into anexos (entidade, entidade_id, url, nome, tipo) values ('briefing_entrega', b, 'https://drive.google.com/x', 'arte.jxl', 'foto');
    out := out || ' entregaAnexo=ok';
  exception when others then out := out || ' entregaAnexo=ERRO:' || sqlerrm; end;
  perform set_config('role', 'none', true);
  out := out || ' avisoCriador=' || (select count(*) from notifications where recipient_id = co and tipo = 'briefing_andamento')
             || ' avisoGestao=' || (select count(*) from notifications where recipient_id = g and tipo = 'briefing_andamento');
  raise exception 'RESULT: %', out;
end $$;
