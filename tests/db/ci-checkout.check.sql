-- Self-checking test of the checkout fotográfico (migration 0028). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- antesEntrada=blocked m_pede=blocked co_pede=ok duplicado=blocked juntoComChecking=ok
-- fotoDoChecking=blocked co_conclui=blocked conclui=ok status=enviada checkingAberto=pendente
-- etapas=checking,checkout avisoChecking=1 avisoPedido=1 avisoCriador=0 excluiLimpa=ok
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); ck uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  ci uuid; ci2 uuid; checkout uuid; checking uuid; cp uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-k@example.com', '{"display_name":"Gestão K"}'), (co, 'co-k@example.com', '{"display_name":"Comercial K"}'),
    (ck, 'ck-k@example.com', '{"display_name":"Checking K"}'), (m, 'm-k@example.com', '{"display_name":"Membro K"}');
  delete from user_roles where user_id in (co, ck, m);
  insert into user_roles (user_id, role) values (g, 'gestor'), (co, 'comercial'), (ck, 'checking'), (m, 'membro')
    on conflict do nothing;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  ci := public.salvar_ci(null, '{"cliente":"Cliente Checkout","tipo":"venda"}', array(select id from paineis where codigo = 'RGB 2'));
  begin perform public.solicitar_checkout_ci(ci, ''); out := out || 'antesEntrada=ALLOWED';
  exception when others then out := out || 'antesEntrada=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  select id into cp from ci_paineis where ci_id = ci;
  perform public.aprovar_ci_painel(cp);

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  begin perform public.solicitar_checkout_ci(ci, ''); out := out || ' m_pede=ALLOWED';
  exception when others then out := out || ' m_pede=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  checkout := public.solicitar_checkout_ci(ci, 'Foto com o painel já sem a vinheta');
  out := out || ' co_pede=ok';
  begin perform public.solicitar_checkout_ci(ci, ''); out := out || ' duplicado=ALLOWED';
  exception when others then out := out || ' duplicado=blocked'; end;
  -- A checking request can be open at the same time.
  begin checking := public.solicitar_foto_ci(ci, ''); out := out || ' juntoComChecking=ok';
  exception when others then out := out || ' juntoComChecking=ERRO:' || sqlerrm; end;

  perform set_config('request.jwt.claims', json_build_object('sub', ck, 'role', 'authenticated')::text, true);
  -- A checking photo does not count for the checkout.
  insert into anexos (entidade, entidade_id, url, nome, tipo, drive_id)
    values ('ci_foto', ci, 'https://drive.google.com/file/d/k0/view', 'painel-checking.jpg', 'foto', 'k0');
  begin perform public.concluir_foto_ci(checkout); out := out || ' fotoDoChecking=ALLOWED';
  exception when others then out := out || ' fotoDoChecking=blocked'; end;
  insert into anexos (entidade, entidade_id, url, nome, tipo, drive_id)
    values ('ci_checkout', ci, 'https://drive.google.com/file/d/k1/view', 'painel-fim.jpg', 'foto', 'k1');
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform public.concluir_foto_ci(checkout); out := out || ' co_conclui=ALLOWED';
  exception when others then out := out || ' co_conclui=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ck, 'role', 'authenticated')::text, true);
  perform public.concluir_foto_ci(checkout);
  out := out || ' conclui=ok status=' || (select status from ci_fotos_pedidos where id = checkout)
             || ' checkingAberto=' || (select status from ci_fotos_pedidos where id = checking)
             || ' etapas=' || (select string_agg(etapa, ',' order by etapa) from ci_fotos_pedidos where ci_id = ci);

  perform set_config('role', 'none', true);
  out := out
    || ' avisoChecking=' || (select count(*) from notifications where recipient_id = ck and tipo = 'ci_checkout_solicitada' and detalhe like '%RGB 2%sem a vinheta%')
    || ' avisoPedido=' || (select count(*) from notifications where recipient_id = co and tipo = 'ci_checkout_enviada')
    -- The creator asked, so they get one notice (counted above), not a second one.
    || ' avisoCriador=' || ((select count(*) from notifications where recipient_id = co and tipo = 'ci_checkout_enviada') - 1);
  perform set_config('role', 'authenticated', true);

  -- Deleting a CI that never entered a panel also clears its checkout photo records.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  ci2 := public.salvar_ci(null, '{"cliente":"Cliente Apagar","tipo":"venda"}', array(select id from paineis where codigo = 'RGB 3'));
  insert into anexos (entidade, entidade_id, url, nome, tipo) values ('ci_checkout', ci2, 'https://drive.google.com/x', 'x.jpg', 'foto');
  perform public.excluir_ci(ci2);
  perform set_config('role', 'none', true);
  out := out || ' excluiLimpa=' || case when exists (select 1 from anexos where entidade_id = ci2) then 'SOBROU' else 'ok' end;
  raise exception 'RESULT: %', out;
end $$;
