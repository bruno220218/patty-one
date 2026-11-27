-- Self-checking test of migration 0051 (fluxo do orçamento). Run it as one statement: it always
-- ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- criou=em_orcamento/1/true envioAntes=blocked projetosEdita=2 projetosStatus=blocked producaoEdita=blocked semPreco=blocked rev1=1/aguardando_aprovacao avisoGestao=true travaComposicao=blocked travaItem=blocked semMotivo=blocked devolvido=devolvido avisoProjetos=true rev2=2 fechado=aprovado avisoComercial=true enviada=Enviada ajuste=em_orcamento/Rascunho/true pedido=true revisoes=3 rev1decisao=devolvido custoRev2=20.00 valorRev2=150.00 producaoRevisoes=0
do $$
declare g uuid := gen_random_uuid(); pj uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); emp uuid; cli uuid; b uuid; v uuid; it uuid; fita uuid; dados jsonb;
  out text := '';
begin
  insert into auth.users (id, email) values (g, 'g-fo@example.com'), (pj, 'pj-fo@example.com'),
    (c, 'c-fo@example.com'), (w, 'w-fo@example.com');
  insert into user_roles (user_id, role) values (g, 'gestor'), (pj, 'membro'), (pj, 'projetos_especiais'),
    (c, 'membro'), (c, 'comercial'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  select id into emp from empresas order by nome limit 1;
  insert into cadastros (nome, is_cliente) values ('Cliente FO', true) returning id into cli;

  perform set_config('role', 'authenticated', true);
  -- Comercial faz o briefing de orçamento.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into briefings (destino, titulo, descricao, vendedor) values ('projetos_especiais', 'Fachada FO',
    'Letreiro em ACM', 'Vendedor FO') returning id into b;

  -- Projetos cria o orçamento a partir do briefing.
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  v := public.criar_orcamento_briefing(b, cli, emp);
  select id into it from vendas_itens where venda_id = v;
  out := 'criou=' || (select orcamento_situacao from vendas where id = v) || '/'
    || (select count(*) from vendas_itens where venda_id = v) || '/'
    || ((select venda_id from briefings where id = b) = v);

  -- Comercial não envia antes de a Gestão fechar.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin update vendas set status = 'Enviada' where id = v;
    out := out || ' envioAntes=ALLOWED';
  exception when check_violation then out := out || ' envioAntes=blocked'; end;

  -- Projetos edita os itens (salvar_venda), mas não a situação.
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  dados := jsonb_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', cli, 'vendedor', 'Vendedor FO',
    'status', 'Rascunho', 'observacao', (select observacao from vendas where id = v), 'desconto', 0,
    'itens', jsonb_build_array(
      jsonb_build_object('id', it, 'categoria', 'Produção', 'descricao', 'Fachada FO em ACM', 'quantidade', 1),
      jsonb_build_object('categoria', 'Serviço', 'descricao', 'Instalação', 'quantidade', 1)));
  perform public.salvar_venda(dados, v);
  out := out || ' projetosEdita=' || (select count(*) from vendas_itens where venda_id = v);
  begin perform public.salvar_venda(jsonb_set(dados, '{status}', '"Enviada"'), v);
    out := out || ' projetosStatus=ALLOWED';
  exception when insufficient_privilege or check_violation then out := out || ' projetosStatus=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  begin perform public.salvar_venda(dados, v);
    out := out || ' producaoEdita=ALLOWED';
  exception when insufficient_privilege then out := out || ' producaoEdita=blocked'; end;

  -- Composição; sem preço no item não envia; com preço vai para a Gestão (R1).
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  fita := estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'Fita FO', 'preco_referencia', 10));
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  perform estoque.salvar_composicao(it, jsonb_build_object('materiais', jsonb_build_array(
    jsonb_build_object('produto_id', fita, 'secao', 'Painel', 'quantidade', 2, 'valor_unitario', 10))));
  begin perform public.enviar_orcamento_aprovacao(v);
    out := out || ' semPreco=ALLOWED';
  exception when invalid_parameter_value then out := out || ' semPreco=blocked'; end;
  perform estoque.aplicar_preco_item(it, 100);
  out := out || ' rev1=' || public.enviar_orcamento_aprovacao(v);
  out := out || '/' || (select orcamento_situacao from vendas where id = v);
  perform set_config('role', 'postgres', true);
  out := out || ' avisoGestao=' || exists (select 1 from notifications where recipient_id = g and tipo = 'orcamento_aprovacao');
  perform set_config('role', 'authenticated', true);

  -- Aguardando a Gestão: composição e itens travados.
  begin perform estoque.salvar_composicao(it, '{}');
    out := out || ' travaComposicao=ALLOWED';
  exception when check_violation then out := out || ' travaComposicao=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin update vendas_itens set valor_unitario = 1 where id = it;
    out := out || ' travaItem=ALLOWED';
  exception when check_violation then out := out || ' travaItem=blocked'; end;

  -- Gestão devolve (motivo obrigatório); Projetos revisa e manda a R2.
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  begin perform public.decidir_orcamento(v, false, '');
    out := out || ' semMotivo=ALLOWED';
  exception when invalid_parameter_value then out := out || ' semMotivo=blocked'; end;
  perform public.decidir_orcamento(v, false, 'Margem baixa');
  out := out || ' devolvido=' || (select orcamento_situacao from vendas where id = v);
  perform set_config('role', 'postgres', true);
  out := out || ' avisoProjetos=' || exists (select 1 from notifications where recipient_id = pj and tipo = 'orcamento_devolvido');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  perform estoque.aplicar_preco_item(it, 150);
  out := out || ' rev2=' || public.enviar_orcamento_aprovacao(v);

  -- Gestão fecha; o Comercial (quem fez o briefing) é avisado e envia ao cliente.
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.decidir_orcamento(v, true);
  out := out || ' fechado=' || (select orcamento_situacao from vendas where id = v);
  perform set_config('role', 'postgres', true);
  out := out || ' avisoComercial=' || exists (select 1 from notifications where recipient_id = c and tipo = 'orcamento_aprovado');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  update vendas set status = 'Enviada' where id = v;
  out := out || ' enviada=' || (select status from vendas where id = v);

  -- Cliente pede ajuste: volta para Projetos; depois a R3 é fechada e o cliente aprova (vira pedido).
  perform public.pedir_ajuste_orcamento(v, 'Trocar a cor');
  out := out || ' ajuste=' || (select orcamento_situacao || '/' || status from vendas where id = v) || '/'
    || ((select ajuste_motivo from orcamento_revisoes where venda_id = v and numero = 2) = 'Trocar a cor');
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  perform public.enviar_orcamento_aprovacao(v);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.decidir_orcamento(v, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  out := out || ' pedido=' || (public.converter_proposta(v) is not null);
  out := out || ' revisoes=' || (select count(*) from orcamento_revisoes where venda_id = v);
  out := out || ' rev1decisao=' || (select decisao from orcamento_revisoes where venda_id = v and numero = 1);
  out := out || ' custoRev2=' || (select custo from orcamento_revisoes where venda_id = v and numero = 2);
  out := out || ' valorRev2=' || (select valor from orcamento_revisoes where venda_id = v and numero = 2);
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' producaoRevisoes=' || (select count(*) from orcamento_revisoes);
  raise exception 'RESULT: %', out;
end $$;
