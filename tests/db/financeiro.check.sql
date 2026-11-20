-- Self-checking test of migration 0026 (financeiro). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- membroVe=0 comercialCria=bloqueado finCria=ok recebidoData=hoje reaberto=null valorZero=bloqueado
-- datasErradas=bloqueado aluguelOk=1 periodicidadeRuim=bloqueado energiaVazia=bloqueado
-- direcaoVe=3 finExclui=0 direcaoExclui=1 gestaoExclui=1
do $$
declare
  g uuid := gen_random_uuid(); di uuid := gen_random_uuid(); fi uuid := gen_random_uuid();
  co uuid := gen_random_uuid(); me uuid := gen_random_uuid(); c uuid; a uuid; e uuid; n int;
  out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-fin@example.com', '{"display_name":"Gestão Fin"}'),
    (di, 'di-fin@example.com', '{"display_name":"Direção Fin"}'),
    (fi, 'fi-fin@example.com', '{"display_name":"Financeiro Fin"}'),
    (co, 'co-fin@example.com', '{"display_name":"Comercial Fin"}'),
    (me, 'me-fin@example.com', '{"display_name":"Membro Fin"}');
  delete from user_roles where user_id in (g, di, fi, co, me);
  insert into user_roles (user_id, role) values
    (g, 'gestor'), (di, 'direcao'), (fi, 'financeiro'), (co, 'comercial'), (me, 'membro');
  perform set_config('role', 'authenticated', true);

  -- O Financeiro cria; Comercial e membro comum não veem nem criam.
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  insert into contas_receber (descricao, vencimento, valor) values ('Pedido 1 — 1/2', current_date, 100)
    returning id into c;
  insert into contratos_aluguel (proprietario, periodicidade, valor, midias) values ('Dono', 'Mensal', 500, '0001, 0003')
    returning id into a;
  insert into contratos_energia (num_cliente, local) values ('123', 'Rua A') returning id into e;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  out := out || 'membroVe=' || (select count(*) from contas_receber);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin
    insert into contas_receber (descricao, vencimento, valor) values ('x', current_date, 1);
    out := out || ' comercialCria=PASSOU';
  exception when others then out := out || ' comercialCria=bloqueado'; end;

  -- Receber grava a data; reabrir limpa; valor zero e data sem "Recebido" não entram.
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  out := out || ' finCria=ok';
  update contas_receber set status = 'Recebido' where id = c;
  out := out || ' recebidoData=' || case when (select recebido_em from contas_receber where id = c)
    = (now() at time zone 'America/Sao_Paulo')::date then 'hoje' else 'ERRO' end;
  update contas_receber set status = 'Aberto' where id = c;
  out := out || ' reaberto=' || coalesce((select recebido_em::text from contas_receber where id = c), 'null');
  begin
    insert into contas_receber (descricao, vencimento, valor) values ('zero', current_date, 0);
    out := out || ' valorZero=PASSOU';
  exception when others then out := out || ' valorZero=bloqueado'; end;
  begin
    insert into contas_receber (descricao, vencimento, valor, status) values ('', current_date, 5, 'Aberto');
    out := out || ' datasErradas=PASSOU';
  exception when others then out := out || ' datasErradas=bloqueado'; end;

  out := out || ' aluguelOk=' || (select count(*) from contratos_aluguel where id = a);
  begin
    insert into contratos_aluguel (proprietario, periodicidade) values ('Outro', 'Quinzenal');
    out := out || ' periodicidadeRuim=PASSOU';
  exception when others then out := out || ' periodicidadeRuim=bloqueado'; end;
  begin
    insert into contratos_energia (titular) values ('Só titular');
    out := out || ' energiaVazia=PASSOU';
  exception when others then out := out || ' energiaVazia=bloqueado'; end;

  -- Direção vê tudo; só Gestão e Direção excluem.
  perform set_config('request.jwt.claims', json_build_object('sub', di, 'role', 'authenticated')::text, true);
  out := out || ' direcaoVe=' || ((select count(*) from contas_receber where id = c)
    + (select count(*) from contratos_aluguel where id = a) + (select count(*) from contratos_energia where id = e));
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  with x as (delete from contas_receber where id = c returning 1) select count(*) into n from x;
  out := out || ' finExclui=' || n;
  perform set_config('request.jwt.claims', json_build_object('sub', di, 'role', 'authenticated')::text, true);
  with x as (delete from contas_receber where id = c returning 1) select count(*) into n from x;
  out := out || ' direcaoExclui=' || n;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  with x as (delete from contratos_aluguel where id = a returning 1) select count(*) into n from x;
  out := out || ' gestaoExclui=' || n;

  raise exception 'RESULT: %', out;
end;
$$;
