-- Self-checking test of the Painéis RGB rules (migration 0011). Run it as one statement
-- against the backend: it always ends with an exception "RESULT: ..." so every change is
-- rolled back. Expected:
-- m_sees=true m_insert=blocked c_insert=ok g_insert=ok dupSlot=blocked outOfRange=blocked
-- createdBy=Criação Teste repId=true edit=ok m_edit=0 hist_alterada=1 hist_by=Criação Teste
-- retirar=ok retiradaPor=Criação Teste editRetirada=0 slotFree=ok
-- avisos1=2 avisoRep=1 avisoGestor=1 grouped=true avisos2=0 renew=1 s_sees=0 anonBlocked=t
do $$
declare
  g uuid := gen_random_uuid(); c uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  rep uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  p1 uuid; p2 uuid; v1 uuid; v2 uuid; v3 uuid; n int; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (g, 'g-rgb@example.com', '{"display_name":"Gestão Teste"}', 'authenticated', 'authenticated'),
    (c, 'c-rgb@example.com', '{"display_name":"Criação Teste"}', 'authenticated', 'authenticated'),
    (m, 'm-rgb@example.com', '{"display_name":"Membro Teste"}', 'authenticated', 'authenticated'),
    (rep, 'r-rgb@example.com', '{"display_name":"Zuleica Representante"}', 'authenticated', 'authenticated'),
    (s, 's-rgb@example.com', '{"display_name":"Estranho Teste"}', 'authenticated', 'authenticated');
  delete from user_roles where user_id in (c, m, rep, s);
  insert into user_roles (user_id, role) values (g, 'gestor'), (c, 'criacao'), (m, 'membro'), (rep, 'comercial')
    on conflict do nothing;
  select id into p1 from paineis where codigo = 'RGB 1';
  select id into p2 from paineis where codigo = 'RGB 2';
  -- Free test slots: retire whatever the import put in RGB 1/2 slots 20-22 (as postgres).
  update painel_vinhetas set retirada_em = now() where painel_id in (p1, p2) and posicao >= 20 and retirada_em is null;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  out := out || 'm_sees=' || ((select count(*) from paineis) = 8);
  begin
    insert into painel_vinhetas (painel_id, posicao, cliente) values (p1, 20, 'X');
    out := out || ' m_insert=ALLOWED';
  exception when others then out := out || ' m_insert=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into painel_vinhetas (painel_id, posicao, cliente, ci, tipo, fim, representante_nome)
    values (p1, 20, 'Cliente Teste', '01/Nov', 'venda', hoje + 3, 'Zuleica') returning id into v1;
  out := out || ' c_insert=ok';

  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  insert into painel_vinhetas (painel_id, posicao, cliente, ci, tipo, fim, representante_nome)
    values (p2, 20, 'Cliente Teste', '02/Nov', 'venda', hoje + 3, 'Zuleica') returning id into v2;
  insert into painel_vinhetas (painel_id, posicao, cliente, tipo, fim, representante_nome)
    values (p1, 21, 'Show de Verão', 'evento', hoje - 1, 'Zuleica') returning id into v3;
  out := out || ' g_insert=ok';
  begin
    insert into painel_vinhetas (painel_id, posicao, cliente) values (p1, 20, 'Outro');
    out := out || ' dupSlot=ALLOWED';
  exception when others then out := out || ' dupSlot=blocked'; end;
  begin
    insert into painel_vinhetas (painel_id, posicao, cliente) values (p1, 23, 'Fora');
    out := out || ' outOfRange=ALLOWED';
  exception when others then out := out || ' outOfRange=blocked'; end;

  out := out || ' createdBy=' || (select created_by_nome from painel_vinhetas where id = v1)
             || ' repId=' || ((select representante_id from painel_vinhetas where id = v1) = rep);

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  update painel_vinhetas set ci = '02/Nov' where id = v1;
  out := out || ' edit=ok';

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  update painel_vinhetas set cliente = 'hack' where id = v1;
  get diagnostics n = row_count; out := out || ' m_edit=' || n;

  out := out || ' hist_alterada=' || (select count(*) from painel_historico where vinheta_id = v1 and acao = 'alterada')
             || ' hist_by=' || (select feito_por_nome from painel_historico where vinheta_id = v1 and acao = 'alterada');

  -- Retire v3 (expired event) and confirm the slot frees up.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  update painel_vinhetas set retirada_em = now() where id = v3;
  out := out || ' retirar=ok retiradaPor=' || (select retirada_por_nome from painel_vinhetas where id = v3);
  update painel_vinhetas set cliente = 'volta' where id = v3;
  get diagnostics n = row_count; out := out || ' editRetirada=' || n;
  insert into painel_vinhetas (painel_id, posicao, cliente, tipo, fim) values (p1, 21, 'Show de Verão 2', 'evento', hoje - 1)
    returning id into v3;
  out := out || ' slotFree=ok';

  -- Avisos (run as the cron would, without a signed-in person). Clear notices from the imported data first.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  perform public.gerar_avisos_paineis();
  delete from notifications where tipo like 'rgb_%';
  delete from painel_avisos_dados where vinheta_id in (v1, v2, v3);
  n := public.gerar_avisos_paineis();
  out := out || ' avisos1=' || (select count(*) from notifications where tipo like 'rgb_%' and project_name in ('Cliente Teste', 'Show de Verão 2') and recipient_id in (g, rep))
             || ' avisoRep=' || (select count(*) from notifications where recipient_id = rep and tipo = 'rgb_vencendo')
             || ' avisoGestor=' || (select count(*) from notifications where recipient_id = g and tipo = 'rgb_vencida' and project_name = 'Show de Verão 2')
             || ' grouped=' || ((select detalhe from notifications where recipient_id = rep and tipo = 'rgb_vencendo') like 'RGB 1 - Painel Shopping / RGB 2 - Painel Canaã%');
  delete from notifications where tipo like 'rgb_%';
  perform public.gerar_avisos_paineis();
  out := out || ' avisos2=' || (select count(*) from notifications where tipo like 'rgb_%');
  -- Renewing (new end date inside the window) arms the notice again.
  update painel_vinhetas set fim = hoje + 5 where id = v1;
  perform public.gerar_avisos_paineis();
  out := out || ' renew=' || (select count(*) from notifications where tipo like 'rgb_%' and recipient_id = rep);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  out := out || ' s_sees=' || (select count(*) from painel_vinhetas);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform count(*) from painel_vinhetas;
    out := out || ' anonBlocked=f';
  exception when others then out := out || ' anonBlocked=t'; end;
  raise exception 'RESULT: %', out;
end $$;
