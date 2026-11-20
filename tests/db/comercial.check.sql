-- Self-checking test of migration 0020 (comercial). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- membroVe=true membroSalva=bloqueado propostaNumero=ok semItens=bloqueado itens=2 pcpSalva=bloqueado
-- tipoMantido=proposta pedido=ok pedidoItens=2 propostaAprovada=Aprovada segundoPedido=bloqueado
-- recusadaVira=bloqueado ordemLigada=ok excluiComercial=0 historicoComercial=bloqueado
-- historicoGestao=1/0 historicoDeNovo=0/1 vinculoCadastro=true vinculoEmpresa=true
-- excluiGestao=1 ordemSemPedido=true
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  me uuid := gen_random_uuid(); c uuid; emp uuid; p uuid; p2 uuid; ped uuid; o uuid; n int; r jsonb;
  out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-com@example.com', '{"display_name":"Gestão Com"}'),
    (co, 'co-com@example.com', '{"display_name":"Comercial Com"}'),
    (pc, 'pc-com@example.com', '{"display_name":"PCP Com"}'),
    (me, 'me-com@example.com', '{"display_name":"Membro Com"}');
  delete from user_roles where user_id in (g, co, pc, me);
  insert into user_roles (user_id, role) values (g, 'gestor'), (co, 'comercial'), (pc, 'pcp'), (me, 'membro');
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  c := salvar_cadastro('{"nome":"Cliente Teste Comercial"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';

  -- Membro vê as empresas, mas não cria proposta.
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  out := out || 'membroVe=' || exists (select 1 from empresas where id = emp);
  begin
    perform salvar_venda(json_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Rascunho',
      'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'x')))::jsonb);
    out := out || ' membroSalva=PASSOU';
  exception when others then out := out || ' membroSalva=bloqueado'; end;

  -- Comercial cria a proposta (número automático) com 2 itens; sem itens não salva.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  p := salvar_venda(json_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Enviada',
    'validade', '2030-01-31', 'itens', json_build_array(
      json_build_object('categoria', 'Mídia OOH', 'descricao', 'Outdoor', 'ponto', 'Av. A', 'periodo_inicio', '2030-01-01',
        'periodo_fim', '2030-01-14', 'quantidade', 2, 'valor_unitario', 500),
      json_build_object('categoria', 'Produção', 'descricao', 'Lona', 'valor_unitario', 300)))::jsonb);
  out := out || ' propostaNumero=' || case when (select numero from vendas where id = p) is not null then 'ok' else 'FALTOU' end;
  begin
    perform salvar_venda(json_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Rascunho',
      'itens', json_build_array())::jsonb);
    out := out || ' semItens=PASSOU';
  exception when others then out := out || ' semItens=bloqueado'; end;
  out := out || ' itens=' || (select count(*) from vendas_itens where venda_id = p);

  -- PCP não altera; o tipo não muda ao salvar de novo.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin
    perform salvar_venda(json_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Enviada',
      'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'x')))::jsonb, p);
    out := out || ' pcpSalva=PASSOU';
  exception when others then out := out || ' pcpSalva=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Enviada',
    'itens', json_build_array(
      json_build_object('categoria', 'Mídia OOH', 'descricao', 'Outdoor', 'quantidade', 2, 'valor_unitario', 500),
      json_build_object('categoria', 'Produção', 'descricao', 'Lona', 'valor_unitario', 300)))::jsonb, p);
  out := out || ' tipoMantido=' || (select tipo from vendas where id = p);

  -- Proposta → pedido: copia os itens, aprova a proposta, só uma vez.
  ped := converter_proposta(p);
  out := out || ' pedido=' || case when (select tipo from vendas where id = ped) = 'pedido' then 'ok' else 'ERRO' end;
  out := out || ' pedidoItens=' || (select count(*) from vendas_itens where venda_id = ped);
  out := out || ' propostaAprovada=' || (select status from vendas where id = p);
  begin
    perform converter_proposta(p);
    out := out || ' segundoPedido=PASSOU';
  exception when others then out := out || ' segundoPedido=bloqueado'; end;
  p2 := salvar_venda(json_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Recusada',
    'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'x')))::jsonb);
  begin
    perform converter_proposta(p2);
    out := out || ' recusadaVira=PASSOU';
  exception when others then out := out || ' recusadaVira=bloqueado'; end;

  -- Ordem de produção ligada ao pedido (PCP).
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  o := salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Lona', 'venda_id', ped,
    'etapas', json_build_array('Arte'))::jsonb);
  out := out || ' ordemLigada=' || case when (select venda_id from ordens_producao where id = o) = ped then 'ok' else 'ERRO' end;

  -- Comercial não exclui; histórico do SIGE só a gestão importa.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  with x as (delete from vendas where id = p2 returning 1) select count(*) into n from x;
  out := out || ' excluiComercial=' || n;
  r := jsonb_build_array(jsonb_build_object('chave_sige', 'autorizacao:999001', 'tipo', 'contrato', 'numero_sige', '999001',
    'cliente_nome', 'cliente teste comercial', 'empresa_nome', 'PATTY PAINEIS LTDA', 'data_documento', '2026-01-05',
    'valor', 100, 'status_sige', 'ATIVO', 'fontes', jsonb_build_array('c.csv'), 'dados_sige', '{}'::jsonb));
  begin
    perform importar_historico_comercial_sige(r);
    out := out || ' historicoComercial=PASSOU';
  exception when others then out := out || ' historicoComercial=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  r := importar_historico_comercial_sige(r) || '{}'::jsonb;
  out := out || ' historicoGestao=' || (r->>'inseridos') || '/' || (r->>'atualizados');
  r := importar_historico_comercial_sige(jsonb_build_array(jsonb_build_object('chave_sige', 'autorizacao:999001',
    'tipo', 'contrato', 'numero_sige', '999001', 'cliente_nome', 'cliente teste comercial',
    'empresa_nome', 'PATTY PAINEIS LTDA', 'data_documento', '2026-01-05', 'valor', 100, 'status_sige', 'ATIVO')));
  out := out || ' historicoDeNovo=' || (r->>'inseridos') || '/' || (r->>'atualizados');
  out := out || ' vinculoCadastro=' || ((select cadastro_id from historico_comercial_sige where chave_sige = 'autorizacao:999001') = c);
  out := out || ' vinculoEmpresa=' || ((select empresa_id from historico_comercial_sige where chave_sige = 'autorizacao:999001') = emp);

  -- Gestão exclui o pedido; a ordem fica sem pedido.
  with x as (delete from vendas where id = ped returning 1) select count(*) into n from x;
  out := out || ' excluiGestao=' || n;
  out := out || ' ordemSemPedido=' || ((select venda_id from ordens_producao where id = o) is null);

  raise exception 'RESULT: %', out;
end;
$$;
