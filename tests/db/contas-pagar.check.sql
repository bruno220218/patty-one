-- Self-checking test of migration 0029 (contas a pagar e comissões). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- comercialVe=0 pagarCria=ok pagoData=hoje semPedido=0 comissoes=2 vendedor=50.00 agencia=100.00
-- vencComissao=hoje repetida=2 desfeito=0 pagaFica=1 parcelas=3 proxVenc=2027-01-10 deNovo=0
-- vigencia=2 semRecorrencia=0 comercialGera=bloqueado finExclui=0
do $$
declare
  g uuid := gen_random_uuid(); fi uuid := gen_random_uuid(); co uuid := gen_random_uuid();
  cli uuid; emp uuid; ped uuid; r1 uuid; r2 uuid; al uuid; al2 uuid; p uuid; n int;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-pag@example.com', '{"display_name":"Gestão Pag"}'),
    (fi, 'fi-pag@example.com', '{"display_name":"Financeiro Pag"}'),
    (co, 'co-pag@example.com', '{"display_name":"Comercial Pag"}');
  delete from user_roles where user_id in (g, fi, co);
  insert into user_roles (user_id, role) values (g, 'gestor'), (fi, 'financeiro'), (co, 'comercial');
  -- Cliente agência (10%) e um pedido da vendedora Ana.
  insert into cadastros (nome, tipo_comissao, percentual_comissao) values ('Agência X', 'Comissão como Agência', 10)
    returning id into cli;
  select id into emp from empresas order by nome limit 1;
  insert into vendas (tipo, numero, empresa_id, cadastro_id, vendedor, status)
    values ('pedido', 9001, emp, cli, 'Ana', 'Aberto') returning id into ped;
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  insert into comissao_vendedores (vendedor, percentual) values ('ANA', 5);
  insert into contas_pagar (categoria, descricao, vencimento, valor) values ('Fornecedor', 'Lona', hoje, 300)
    returning id into p;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  out := out || 'comercialVe=' || (select count(*) from contas_pagar);
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  out := out || ' pagarCria=ok';
  update contas_pagar set status = 'Pago' where id = p;
  out := out || ' pagoData=' || case when (select pago_em from contas_pagar where id = p) = hoje then 'hoje' else 'ERRO' end;

  -- Recebimento sem pedido não gera comissão; com pedido gera vendedor (5%) e agência (10%).
  insert into contas_receber (descricao, vencimento, valor, status) values ('Avulsa', hoje, 500, 'Recebido');
  out := out || ' semPedido=' || (select count(*) from contas_pagar where categoria = 'Comissão');
  insert into contas_receber (descricao, vencimento, valor, venda_id) values ('Pedido 9001 1/2', hoje, 1000, ped)
    returning id into r1;
  update contas_receber set status = 'Recebido' where id = r1;
  out := out || ' comissoes=' || (select count(*) from contas_pagar where conta_receber_id = r1);
  out := out || ' vendedor=' || (select valor from contas_pagar where conta_receber_id = r1 and comissao_tipo = 'Vendedor');
  out := out || ' agencia=' || (select valor from contas_pagar where conta_receber_id = r1 and comissao_tipo = 'Agência');
  out := out || ' vencComissao=' || case when (select min(vencimento) from contas_pagar where conta_receber_id = r1) = hoje then 'hoje' else 'ERRO' end;
  update contas_receber set observacao = 'x' where id = r1;
  update contas_receber set status = 'Recebido', recebido_em = hoje where id = r1;
  out := out || ' repetida=' || (select count(*) from contas_pagar where conta_receber_id = r1);
  -- Desfazer o recebimento tira as comissões em aberto; a já paga fica.
  update contas_receber set status = 'Aberto' where id = r1;
  out := out || ' desfeito=' || (select count(*) from contas_pagar where conta_receber_id = r1);
  insert into contas_receber (descricao, vencimento, valor, venda_id, status) values ('Pedido 9001 2/2', hoje, 200, ped, 'Recebido')
    returning id into r2;
  update contas_pagar set status = 'Pago' where conta_receber_id = r2 and comissao_tipo = 'Vendedor';
  update contas_receber set status = 'Cancelado' where id = r2;
  out := out || ' pagaFica=' || (select count(*) from contas_pagar where conta_receber_id = r2);

  -- Parcelas do aluguel: trimestral de 10/04/2026 até 31/12/2026 = abr, jul, out.
  insert into contratos_aluguel (proprietario, periodicidade, valor, vencimento) values ('Dono', 'Trimestral', 900, '2026-04-10')
    returning id into al;
  out := out || ' parcelas=' || gerar_parcelas_aluguel('2026-12-31');
  out := out || ' proxVenc=' || (select vencimento from contratos_aluguel where id = al);
  out := out || ' deNovo=' || gerar_parcelas_aluguel('2026-12-31');
  update contratos_aluguel set ativo = false where id = al;
  insert into contratos_aluguel (proprietario, periodicidade, valor, vencimento, vigencia)
    values ('Dono 2', 'Mensal', 100, '2026-01-05', '2026-02-20') returning id into al2;
  out := out || ' vigencia=' || gerar_parcelas_aluguel('2026-12-31');
  insert into contratos_aluguel (proprietario, periodicidade, valor, vencimento) values ('Dono 3', 'Sem recorrência', 100, '2026-01-05');
  update contratos_aluguel set ativo = false where id = al2;
  out := out || ' semRecorrencia=' || gerar_parcelas_aluguel('2026-12-31');
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin
    perform gerar_parcelas_aluguel('2026-12-31');
    out := out || ' comercialGera=PASSOU';
  exception when others then out := out || ' comercialGera=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  with x as (delete from contas_pagar where id = p returning 1) select count(*) into n from x;
  out := out || ' finExclui=' || n;

  raise exception 'RESULT: %', out;
end;
$$;
