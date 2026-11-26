-- Self-checking test of migration 0045 (sinal pago dos pedidos para o Comercial). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- comercialLeContas=0 comercialVe=2/1 semConta=0 cancelada=1/1 membro=blocked
do $$
declare
  co uuid := gen_random_uuid(); fi uuid := gen_random_uuid(); mb uuid := gen_random_uuid();
  c uuid; emp uuid; ped uuid; ped2 uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-sp@example.com', '{"display_name":"Comercial SP"}'), (fi, 'fi-sp@example.com', '{"display_name":"Financeiro SP"}'),
    (mb, 'mb-sp@example.com', '{"display_name":"Membro SP"}');
  delete from user_roles where user_id in (co, fi, mb);
  insert into user_roles (user_id, role) values (co, 'comercial'), (fi, 'financeiro'), (mb, 'membro');
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  c := salvar_cadastro('{"nome":"Cliente SP"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'Placa SP')))::jsonb);
  ped2 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'Placa SP 2')))::jsonb);

  -- O financeiro lança o sinal (recebido) e a 2ª parcela (aberta) do pedido; e uma cancelada no outro.
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  insert into contas_receber (venda_id, descricao, vencimento, valor, status, recebido_em)
    values (ped, 'Sinal', current_date, 500, 'Recebido', current_date);
  insert into contas_receber (venda_id, descricao, vencimento, valor) values (ped, 'Parcela 2', current_date + 30, 500);
  insert into contas_receber (venda_id, descricao, vencimento, valor, status) values (ped2, 'Cancelada', current_date, 10, 'Cancelado');

  -- O comercial não lê as contas, mas vê se o sinal foi recebido.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  out := out || 'comercialLeContas=' || (select count(*) from contas_receber where venda_id = ped)
    || ' comercialVe=' || (select contas || '/' || recebidas from sinal_pago_pedidos(array[ped, ped2]) where venda_id = ped)
    || ' semConta=' || (select count(*) from sinal_pago_pedidos(array[ped2]));
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  -- Parcela cancelada não conta.
  update contas_receber set status = 'Cancelado' where venda_id = ped and descricao = 'Parcela 2';
  out := out || ' cancelada=' || (select contas || '/' || recebidas from sinal_pago_pedidos(array[ped]) where venda_id = ped);

  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  begin perform * from sinal_pago_pedidos(array[ped]); out := out || ' membro=ALLOWED';
  exception when others then out := out || ' membro=blocked'; end;

  raise exception 'RESULT: %', out;
end $$;
