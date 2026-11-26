-- Self-checking test of migration 0037 (Dashboard). Run it as one statement: it always ends with
-- an exception "RESULT: ..." so every change is rolled back. The numbers are differences against
-- the resumo read before the test data went in, so existing rows don't matter. Expected:
-- semEquipe=blocked decisaoMantida=true pedidos=200/1/70/1 abertas=2/160 vencendo=1 conversao=1/1
-- decisaoLimpa=true atrasadas=1 andamento=1/1 hoje=3/1 naoRealizados=1 projetos=1/1 bloqueios=1
-- fila=1 ocupacaoAtual=5/2/0/3 ocupacaoProxima=5/0/3/2 manutencao=1 comercialFinanceiro=null
-- receberVencido=100/1 receber7=200/1 pagar7=30/40 recebidoMes=50
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); fi uuid := gen_random_uuid();
  ninguem uuid := gen_random_uuid();
  c uuid; emp uuid; tipo uuid; v uuid; pa uuid; pb uuid; pr1 uuid; pr2 uuid; pr3 uuid;
  hoje date; r0 jsonb; r1 jsonb; rc jsonb; bs_a record; bs_p record; d timestamptz;
  out text := '';
begin
  insert into auth.users (id, email) values (g, 'g-db@example.com'), (co, 'co-db@example.com'),
    (fi, 'fi-db@example.com'), (ninguem, 'n-db@example.com');
  delete from user_roles where user_id in (g, co, fi, ninguem);
  insert into user_roles (user_id, role) values (g, 'gestor'), (co, 'membro'), (co, 'comercial'),
    (fi, 'membro'), (fi, 'financeiro');

  -- An account not approved yet sees nothing.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ninguem, 'role', 'authenticated')::text, true);
  begin perform dashboard_resumo(); out := 'semEquipe=ALLOWED';
  exception when insufficient_privilege then out := 'semEquipe=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  r0 := dashboard_resumo();
  hoje := (r0->>'hoje')::date;

  -- ---------- test data (as the owner, so the module rules don't get in the way) ----------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into cadastros (nome) values ('Cliente Dashboard') returning id into c;
  select id into emp from empresas order by nome limit 1;

  -- Pedidos: this month 2×100−10 + 1×50 − 40 = 200; cancelled one doesn't count; last month 70.
  insert into vendas (tipo, empresa_id, cadastro_id, status, desconto)
    values ('pedido', emp, c, 'Aberto', 40) returning id into v;
  insert into vendas_itens (venda_id, categoria, descricao, quantidade, valor_unitario, desconto)
    values (v, 'Serviço', 'A', 2, 100, 10), (v, 'Serviço', 'B', 1, 50, 0);
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('pedido', emp, c, 'Cancelado')
    returning id into v;
  insert into vendas_itens (venda_id, categoria, descricao, valor_unitario) values (v, 'Serviço', 'C', 999);
  insert into vendas (tipo, empresa_id, cadastro_id, status, created_at)
    values ('pedido', emp, c, 'Concluído', now() - interval '1 month') returning id into v;
  insert into vendas_itens (venda_id, categoria, descricao, valor_unitario) values (v, 'Serviço', 'D', 70);

  -- Propostas: Enviada (100, valid in 3 days) and Rascunho (60, in 10 days) are open.
  insert into vendas (tipo, empresa_id, cadastro_id, status, validade)
    values ('proposta', emp, c, 'Enviada', hoje + 3) returning id into v;
  insert into vendas_itens (venda_id, categoria, descricao, valor_unitario) values (v, 'Serviço', 'E', 100);
  insert into vendas (tipo, empresa_id, cadastro_id, status, validade)
    values ('proposta', emp, c, 'Rascunho', hoje + 10) returning id into v;
  insert into vendas_itens (venda_id, categoria, descricao, valor_unitario) values (v, 'Serviço', 'F', 60);
  -- One approved now (it was Enviada) and one created already refused.
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('proposta', emp, c, 'Enviada')
    returning id into v;
  update vendas set status = 'Aprovada' where id = v;
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('proposta', emp, c, 'Recusada');
  -- Editing an approved proposta keeps the decision date; nobody can write it directly.
  select decidida_em into d from vendas where id = v;
  update vendas set observacao = 'editada', decidida_em = '2000-01-01' where id = v;
  out := out || ' decisaoMantida=' || ((select decidida_em from vendas where id = v) = d);

  -- Ordens: one late (yesterday, Aguardando), one due today in progress, one late but finished.
  insert into ordens_producao (tipo, descricao, status, data_prevista) values
    ('Instalação', 'Atrasada', 'Aguardando', hoje - 1),
    ('Instalação', 'Hoje', 'Em andamento', hoje),
    ('Instalação', 'Pronta', 'Concluída', hoje - 5);
  -- Programação of today: one done, one planned, one not done.
  insert into programacao_servicos (data, data_original, setor, servico, status) values
    (hoje, hoje, 'Corte', 'S1', 'Concluído'),
    (hoje, hoje, 'Corte', 'S2', 'Programado'),
    (hoje, hoje, 'Corte', 'S3', 'Não realizado');

  -- Projetos: pr1 late with an open task and a blocker; pr2 archived; pr3 finished.
  insert into projects (name, due_date) values ('Dash 1', hoje - 2) returning id into pr1;
  insert into projects (name, due_date, archived) values ('Dash 2', hoje - 2, true) returning id into pr2;
  insert into projects (name, due_date) values ('Dash 3', hoje - 2) returning id into pr3;
  insert into project_tasks (project_id, title) values (pr1, 'aberta'), (pr2, 'aberta');
  insert into project_tasks (project_id, title) values (pr3, 'feita');
  -- (the task guard clears completed_at on insert, so it is ticked afterwards)
  update project_tasks set completed_at = now() where project_id = pr3;
  insert into project_blockers (project_id, description) values (pr1, 'falta material'), (pr2, 'arquivado');
  insert into project_blockers (project_id, description, resolved_at) values (pr1, 'resolvido', now());
  -- Liberações are created by comercial (guard trigger).
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  insert into liberacoes (modelo, cliente, motivo_sem_pedido) values ('midia', 'Cliente Dash', 'Interno');
  perform set_config('request.jwt.claims', '', true);

  -- Mídia: points with 2 and 3 faces (A occupied now, B reserved next) and one in maintenance.
  select id into tipo from tipos_midia limit 1;
  insert into pontos_midia (nome, tipo_id, faces) values ('Dash A', tipo, 2) returning id into pa;
  insert into pontos_midia (nome, tipo_id, faces) values ('Dash B', tipo, 3) returning id into pb;
  insert into pontos_midia (nome, tipo_id, faces, status) values ('Dash C', tipo, 1, 'Em manutenção');
  select * into bs_a from calendario_bissemanas where hoje between inicio and fim;
  select * into bs_p from calendario_bissemanas where inicio = bs_a.fim + 1;
  insert into pontos_ocupacao (ponto_id, ano, bissemana, status) values
    (pa, bs_a.ano, bs_a.numero, 'Ocupado'), (pb, bs_p.ano, bs_p.numero, 'Reservado');

  -- Financeiro.
  insert into contas_receber (descricao, vencimento, valor) values
    ('vencida', hoje - 1, 100), ('em 5 dias', hoje + 5, 200), ('em 20 dias', hoje + 20, 999);
  insert into contas_receber (descricao, vencimento, valor, status, recebido_em)
    values ('recebida', hoje - 10, 50, 'Recebido', hoje);
  insert into contas_pagar (categoria, descricao, vencimento, valor) values
    ('Fornecedor', 'vencida', hoje - 3, 30), ('Fornecedor', 'em 2 dias', hoje + 2, 40),
    ('Fornecedor', 'em 20 dias', hoje + 20, 999);

  -- ---------- read again ----------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  rc := dashboard_resumo();
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  r1 := dashboard_resumo();

  out := out
    || ' pedidos=' || ((r1#>>'{comercial,pedidos_mes,valor}')::numeric - (r0#>>'{comercial,pedidos_mes,valor}')::numeric)::text::numeric::float8
    || '/' || ((r1#>>'{comercial,pedidos_mes,quantidade}')::int - (r0#>>'{comercial,pedidos_mes,quantidade}')::int)
    || '/' || ((r1#>>'{comercial,pedidos_mes,valor_anterior}')::numeric - (r0#>>'{comercial,pedidos_mes,valor_anterior}')::numeric)::text::numeric::float8
    || '/' || ((r1#>>'{comercial,pedidos_mes,quantidade_anterior}')::int - (r0#>>'{comercial,pedidos_mes,quantidade_anterior}')::int)
    || ' abertas=' || ((r1#>>'{comercial,propostas_abertas,quantidade}')::int - (r0#>>'{comercial,propostas_abertas,quantidade}')::int)
    || '/' || ((r1#>>'{comercial,propostas_abertas,valor}')::numeric - (r0#>>'{comercial,propostas_abertas,valor}')::numeric)::text::numeric::float8
    || ' vencendo=' || ((r1#>>'{comercial,propostas_vencendo,quantidade}')::int - (r0#>>'{comercial,propostas_vencendo,quantidade}')::int)
    || ' conversao=' || ((r1#>>'{comercial,conversao,aprovadas}')::int - (r0#>>'{comercial,conversao,aprovadas}')::int)
    || '/' || ((r1#>>'{comercial,conversao,recusadas}')::int - (r0#>>'{comercial,conversao,recusadas}')::int);

  -- Back to Enviada clears the decision.
  perform set_config('role', 'postgres', true);
  update vendas set status = 'Enviada' where id = v;
  out := out || ' decisaoLimpa=' || ((select decidida_em from vendas where id = v) is null);

  out := out
    || ' atrasadas=' || ((r1#>>'{producao,ordens_atrasadas}')::int - (r0#>>'{producao,ordens_atrasadas}')::int)
    || ' andamento=' || ((r1#>>'{producao,ordens_andamento,aguardando}')::int - (r0#>>'{producao,ordens_andamento,aguardando}')::int)
    || '/' || ((r1#>>'{producao,ordens_andamento,em_andamento}')::int - (r0#>>'{producao,ordens_andamento,em_andamento}')::int)
    || ' hoje=' || ((r1#>>'{producao,servicos_hoje,total}')::int - (r0#>>'{producao,servicos_hoje,total}')::int)
    || '/' || ((r1#>>'{producao,servicos_hoje,concluidos}')::int - (r0#>>'{producao,servicos_hoje,concluidos}')::int)
    || ' naoRealizados=' || ((r1#>>'{producao,nao_realizados}')::int - (r0#>>'{producao,nao_realizados}')::int)
    || ' projetos=' || ((r1#>>'{projetos,em_andamento}')::int - (r0#>>'{projetos,em_andamento}')::int)
    || '/' || ((r1#>>'{projetos,atrasados}')::int - (r0#>>'{projetos,atrasados}')::int)
    || ' bloqueios=' || ((r1#>>'{projetos,bloqueios}')::int - (r0#>>'{projetos,bloqueios}')::int)
    || ' fila=' || ((r1#>>'{projetos,liberacoes_fila,quantidade}')::int - (r0#>>'{projetos,liberacoes_fila,quantidade}')::int)
    || ' ocupacaoAtual=' || ((r1#>>'{midia,atual,faces}')::int - (r0#>>'{midia,atual,faces}')::int)
    || '/' || ((r1#>>'{midia,atual,ocupadas}')::int - (r0#>>'{midia,atual,ocupadas}')::int)
    || '/' || ((r1#>>'{midia,atual,reservadas}')::int - (r0#>>'{midia,atual,reservadas}')::int)
    || '/' || ((r1#>>'{midia,atual,livres}')::int - (r0#>>'{midia,atual,livres}')::int)
    || ' ocupacaoProxima=' || ((r1#>>'{midia,proxima,faces}')::int - (r0#>>'{midia,proxima,faces}')::int)
    || '/' || ((r1#>>'{midia,proxima,ocupadas}')::int - (r0#>>'{midia,proxima,ocupadas}')::int)
    || '/' || ((r1#>>'{midia,proxima,reservadas}')::int - (r0#>>'{midia,proxima,reservadas}')::int)
    || '/' || ((r1#>>'{midia,proxima,livres}')::int - (r0#>>'{midia,proxima,livres}')::int)
    || ' manutencao=' || ((r1#>>'{midia,pontos_manutencao}')::int - (r0#>>'{midia,pontos_manutencao}')::int)
    || ' comercialFinanceiro=' || coalesce(rc->>'financeiro', 'null')
    || ' receberVencido=' || ((r1#>>'{financeiro,receber_vencido,valor}')::numeric - (r0#>>'{financeiro,receber_vencido,valor}')::numeric)::text::numeric::float8
    || '/' || ((r1#>>'{financeiro,receber_vencido,quantidade}')::int - (r0#>>'{financeiro,receber_vencido,quantidade}')::int)
    || ' receber7=' || ((r1#>>'{financeiro,receber_7_dias,valor}')::numeric - (r0#>>'{financeiro,receber_7_dias,valor}')::numeric)::text::numeric::float8
    || '/' || ((r1#>>'{financeiro,receber_7_dias,quantidade}')::int - (r0#>>'{financeiro,receber_7_dias,quantidade}')::int)
    || ' pagar7=' || ((r1#>>'{financeiro,pagar_7_dias,vencido}')::numeric - (r0#>>'{financeiro,pagar_7_dias,vencido}')::numeric)::text::numeric::float8
    || '/' || ((r1#>>'{financeiro,pagar_7_dias,proximos}')::numeric - (r0#>>'{financeiro,pagar_7_dias,proximos}')::numeric)::text::numeric::float8
    || ' recebidoMes=' || ((r1#>>'{financeiro,recebido_mes,valor}')::numeric - (r0#>>'{financeiro,recebido_mes,valor}')::numeric)::text::numeric::float8;
  raise exception 'RESULT: %', out;
end $$;
