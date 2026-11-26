-- Self-checking test of migration 0038 (mudança no pedido depois da liberação). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- semLiberacao=0 semMudanca=0 valorNaoConta=0 eventos=1 situacao=t cliente=t alterado=t novo=t ordemNova=Aguardando removidoParado=Cancelada removidoIniciado=Em andamento textoIniciado=t eventoOrdem=t autorNaoAvisado=t aviso=1 pcpNaoSalva=blocked
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  c uuid; c2 uuid; emp uuid; ped uuid; livre uuid; lib uuid;
  ia uuid; ib uuid; ic uuid; oa uuid; ob uuid; oc uuid; e uuid; txt text; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-mp@example.com', '{"display_name":"Comercial MP"}'),
    (pc, 'pc-mp@example.com', '{"display_name":"PCP MP"}');
  delete from user_roles where user_id in (co, pc);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);

  c := salvar_cadastro('{"nome":"Cliente MP"}'::jsonb);
  c2 := salvar_cadastro('{"nome":"Outro MP"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';

  -- Pedido sem liberação: salvar não registra nada.
  livre := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Livre')))::jsonb);
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Em andamento',
    'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Livre 2')))::jsonb, livre);
  out := out || 'semLiberacao=' || (select count(*) from liberacao_eventos where tipo = 'alteracao_pedido');

  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('categoria', 'Produção', 'descricao', 'Fachada', 'quantidade', 1, 'valor_unitario', 100),
      json_build_object('categoria', 'Serviço', 'descricao', 'Placa'),
      json_build_object('categoria', 'Serviço', 'descricao', 'Totem')))::jsonb);
  select id into ia from vendas_itens where venda_id = ped and descricao = 'Fachada';
  select id into ib from vendas_itens where venda_id = ped and descricao = 'Placa';
  select id into ic from vendas_itens where venda_id = ped and descricao = 'Totem';
  insert into liberacoes (modelo, cliente, venda_id) values ('projeto', 'Cliente MP', ped) returning id into lib;
  select id into oa from ordens_producao where venda_item_id = ia;
  select id into ob from ordens_producao where venda_item_id = ib;
  select id into oc from ordens_producao where venda_item_id = ic;

  -- Salvar igual: nada. Mudar só o valor: nada (não importa para a produção).
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('id', ia, 'categoria', 'Produção', 'descricao', 'Fachada', 'quantidade', 1, 'valor_unitario', 100),
      json_build_object('id', ib, 'categoria', 'Serviço', 'descricao', 'Placa'),
      json_build_object('id', ic, 'categoria', 'Serviço', 'descricao', 'Totem')))::jsonb, ped);
  out := out || ' semMudanca=' || (select count(*) from liberacao_eventos where liberacao_id = lib and tipo = 'alteracao_pedido');
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('id', ia, 'categoria', 'Produção', 'descricao', 'Fachada', 'quantidade', 1, 'valor_unitario', 150),
      json_build_object('id', ib, 'categoria', 'Serviço', 'descricao', 'Placa'),
      json_build_object('id', ic, 'categoria', 'Serviço', 'descricao', 'Totem')))::jsonb, ped);
  out := out || ' valorNaoConta=' || (select count(*) from liberacao_eventos where liberacao_id = lib and tipo = 'alteracao_pedido');

  -- Aprovada; a ordem do Totem começa.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  update liberacoes set status = 'aprovada' where id = lib;
  select id into e from ordens_producao_etapas where ordem_id = oc order by ordem limit 1;
  perform iniciar_etapa_producao(e);

  -- O comercial muda situação, cliente e a quantidade da Fachada, tira Placa e Totem, inclui Banner.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c2, 'status', 'Em andamento',
    'itens', json_build_array(
      json_build_object('id', ia, 'categoria', 'Produção', 'descricao', 'Fachada', 'quantidade', 3, 'valor_unitario', 150),
      json_build_object('categoria', 'Produção', 'descricao', 'Banner', 'ponto', 'P-2')))::jsonb, ped);
  select detalhe into txt from liberacao_eventos where liberacao_id = lib and tipo = 'alteracao_pedido';
  out := out || ' eventos=' || (select count(*) from liberacao_eventos where liberacao_id = lib and tipo = 'alteracao_pedido')
    || ' situacao=' || (position('Situação do pedido: Aberto → Em andamento' in txt) > 0)
    || ' cliente=' || (position('Cliente: Cliente MP → Outro MP' in txt) > 0)
    || ' alterado=' || (position('Item alterado: Fachada: quantidade 1 → 3' in txt) > 0)
    || ' novo=' || (position('Item novo: Banner (P-2) — ordem nº' in txt) > 0)
    || ' ordemNova=' || (select o.status from ordens_producao o join vendas_itens i on i.id = o.venda_item_id
                         where i.venda_id = ped and i.descricao = 'Banner')
    || ' removidoParado=' || (select status from ordens_producao where id = ob)
    || ' removidoIniciado=' || (select status from ordens_producao where id = oc)
    || ' textoIniciado=' || (position('Item removido: Totem — a ordem nº' in txt) > 0 and position('já começou e continua' in txt) > 0)
    || ' eventoOrdem=' || exists (select 1 from ordens_producao_eventos where ordem_id = oa and descricao = 'Item do pedido alterado: quantidade 1 → 3')
    || ' autorNaoAvisado=' || (not exists (select 1 from notifications where tipo = 'liberacao_pedido_alterado' and recipient_id = co));

  -- Quem não vende não chama o registro.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  out := out || ' aviso=' || (select count(*) from notifications where tipo = 'liberacao_pedido_alterado' and recipient_id = pc);
  begin perform registrar_alteracao_pedido(ped, '{"itens":[]}'::jsonb); out := out || ' pcpNaoSalva=ALLOWED';
  exception when others then out := out || ' pcpNaoSalva=blocked'; end;

  raise exception 'RESULT: %', out;
end;
$$;
