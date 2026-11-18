-- Self-checking test of the photo request flow (migration 0016). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- antesEntrada=blocked m_pede=blocked co_pede=ok duplicado=blocked
-- semFoto=blocked co_conclui=blocked conclui=ok status=enviada cancelarFechado=blocked
-- novoPedido=ok cancelaOutro=blocked cancela=ok avisoChecking=1 avisoPedido=1
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); ck uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  ci uuid; pedido uuid; pedido2 uuid; cp uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-f@example.com', '{"display_name":"Gestão F"}'), (co, 'co-f@example.com', '{"display_name":"Comercial F"}'),
    (ck, 'ck-f@example.com', '{"display_name":"Checking F"}'), (m, 'm-f@example.com', '{"display_name":"Membro F"}');
  delete from user_roles where user_id in (co, ck, m);
  insert into user_roles (user_id, role) values (g, 'gestor'), (co, 'comercial'), (ck, 'checking'), (m, 'membro')
    on conflict do nothing;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  ci := public.salvar_ci(null, '{"cliente":"Cliente Foto","tipo":"venda"}', array(select id from paineis where codigo = 'RGB 1'));
  begin perform public.solicitar_foto_ci(ci, ''); out := out || 'antesEntrada=ALLOWED';
  exception when others then out := out || 'antesEntrada=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  select id into cp from ci_paineis where ci_id = ci;
  perform public.aprovar_ci_painel(cp);

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  begin perform public.solicitar_foto_ci(ci, ''); out := out || ' m_pede=ALLOWED';
  exception when others then out := out || ' m_pede=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  pedido := public.solicitar_foto_ci(ci, 'Foto à noite, por favor');
  out := out || ' co_pede=ok';
  begin perform public.solicitar_foto_ci(ci, ''); out := out || ' duplicado=ALLOWED';
  exception when others then out := out || ' duplicado=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', ck, 'role', 'authenticated')::text, true);
  begin perform public.concluir_foto_ci(pedido); out := out || ' semFoto=ALLOWED';
  exception when others then out := out || ' semFoto=blocked'; end;
  insert into anexos (entidade, entidade_id, url, nome, tipo, drive_id)
    values ('ci_foto', ci, 'https://drive.google.com/file/d/f1/view', 'painel.jpg', 'foto', 'f1');
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform public.concluir_foto_ci(pedido); out := out || ' co_conclui=ALLOWED';
  exception when others then out := out || ' co_conclui=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ck, 'role', 'authenticated')::text, true);
  perform public.concluir_foto_ci(pedido);
  out := out || ' conclui=ok status=' || (select status from ci_fotos_pedidos where id = pedido);
  begin perform public.cancelar_foto_ci(pedido); out := out || ' cancelarFechado=ALLOWED';
  exception when others then out := out || ' cancelarFechado=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  pedido2 := public.solicitar_foto_ci(ci, '');
  out := out || ' novoPedido=ok';
  perform set_config('request.jwt.claims', json_build_object('sub', ck, 'role', 'authenticated')::text, true);
  begin perform public.cancelar_foto_ci(pedido2); out := out || ' cancelaOutro=ALLOWED';
  exception when others then out := out || ' cancelaOutro=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  perform public.cancelar_foto_ci(pedido2);
  out := out || ' cancela=ok';

  perform set_config('role', 'none', true);
  out := out || ' avisoChecking=' || (select count(*) from notifications where recipient_id = ck and tipo = 'ci_foto_solicitada' and detalhe like '%RGB 1%noite%')
             || ' avisoPedido=' || (select count(*) from notifications where recipient_id = co and tipo = 'ci_foto_enviada');
  raise exception 'RESULT: %', out;
end $$;
