-- Self-checking test of migration 0048 (estoque: lista de material, previsão, lista de compras).
-- Run it as one statement: it always ends with an exception "RESULT: ..." so every change is
-- rolled back. Expected:
-- producaoLista=blocked projetosLista=1 soma=4 baixado=3 pendente=5 copiou=1 lona=7/9/-2/2/3 cola=5/9/4 propostaSai=true enviadaNaoConta=true concluidoNaoConta=true custoProducao=null producaoLe=true excluiNaLista=blocked vazia=0 cascata=0
do $$
declare g uuid := gen_random_uuid(); e uuid := gen_random_uuid(); pj uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); emp uuid; cli uuid; lona uuid; cola uuid;
  p1 uuid; p2 uuid; p3 uuid; d1 uuid; d2 uuid; novo uuid;
  i1 uuid; i2 uuid; i3 uuid; id1 uuid; id2 uuid; ord uuid; n integer; out text := '';
begin
  insert into auth.users (id, email) values (g, 'g-li@example.com'), (e, 'e-li@example.com'),
    (pj, 'pj-li@example.com'), (w, 'w-li@example.com');
  insert into user_roles (user_id, role) values (g, 'gestor'), (e, 'membro'), (e, 'estoque'),
    (pj, 'membro'), (pj, 'projetos_especiais'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  select id into emp from empresas order by nome limit 1;
  insert into cadastros (nome, is_cliente) values ('Cliente LI', true) returning id into cli;

  -- Orçamentos: P1 aprovada (sem pedido), P2 enviada, P3 enviada (vira pedido), D1 aberto, D2 concluído.
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('proposta', emp, cli, 'Aprovada') returning id into p1;
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('proposta', emp, cli, 'Enviada') returning id into p2;
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('proposta', emp, cli, 'Enviada') returning id into p3;
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('pedido', emp, cli, 'Aberto') returning id into d1;
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('pedido', emp, cli, 'Concluído') returning id into d2;
  insert into vendas_itens (venda_id, ordem, categoria, descricao) values (p1, 1, 'Produção', 'Fachada P1') returning id into i1;
  insert into vendas_itens (venda_id, ordem, categoria, descricao) values (p2, 1, 'Produção', 'Fachada P2') returning id into i2;
  insert into vendas_itens (venda_id, ordem, categoria, descricao) values (p3, 1, 'Produção', 'Placa P3') returning id into i3;
  insert into vendas_itens (venda_id, ordem, categoria, descricao) values (d1, 1, 'Produção', 'Lona D1') returning id into id1;
  insert into vendas_itens (venda_id, ordem, categoria, descricao) values (d2, 1, 'Produção', 'Lona D2') returning id into id2;
  insert into ordens_producao (tipo, descricao, cadastro_id, venda_id, venda_item_id, status)
    values ('Impressão', 'Ordem D1', cli, d1, id1, 'Em andamento') returning id into ord;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  lona := estoque.salvar_produto(null, jsonb_build_object('setor', '01', 'nome', 'Lona LI', 'unidade', 'm²', 'estoque_minimo', 1));
  cola := estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'Cola LI'));
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Entrada', 'produto_id', lona, 'quantidade', 10, 'valor_unitario', 20));
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Entrada', 'produto_id', cola, 'quantidade', 5, 'valor_unitario', 3));

  -- Produção não monta lista; Projetos monta. Produto repetido soma.
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  begin perform estoque.salvar_lista_material(i1, jsonb_build_array(jsonb_build_object('produto_id', lona, 'quantidade', 1)));
    out := out || 'producaoLista=ALLOWED';
  exception when insufficient_privilege then out := out || 'producaoLista=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  n := estoque.salvar_lista_material(i1, jsonb_build_array(
    jsonb_build_object('produto_id', lona, 'quantidade', 1),
    jsonb_build_object('produto_id', lona, 'quantidade', 3)));
  out := out || ' projetosLista=' || n;
  out := out || ' soma=' || trim_scale((select quantidade from estoque.v_materiais_item where venda_item_id = i1));
  perform estoque.salvar_lista_material(i2, jsonb_build_array(jsonb_build_object('produto_id', lona, 'quantidade', 100)));
  perform estoque.salvar_lista_material(i3, jsonb_build_array(jsonb_build_object('produto_id', cola, 'quantidade', 7)));
  perform estoque.salvar_lista_material(id1, jsonb_build_array(
    jsonb_build_object('produto_id', lona, 'quantidade', 8), jsonb_build_object('produto_id', cola, 'quantidade', 2)));
  perform estoque.salvar_lista_material(id2, jsonb_build_array(jsonb_build_object('produto_id', lona, 'quantidade', 50)));

  -- Baixa de 3 de lona para a ordem do item D1: pendente 8 − 3 = 5.
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Baixa', 'produto_id', lona,
    'quantidade', 4, 'ordem_id', ord, 'responsavel', 'Zé'));
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Devolução', 'produto_id', lona,
    'quantidade', 1, 'ordem_id', ord, 'responsavel', 'Zé'));
  out := out || ' baixado=' || trim_scale((select baixado from estoque.v_materiais_item where venda_item_id = id1 and produto_id = lona));
  out := out || ' pendente=' || trim_scale((select pendente from estoque.v_materiais_item where venda_item_id = id1 and produto_id = lona));

  -- P3 vira pedido: a lista vai junto e a proposta sai da conta (conta o pedido).
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  novo := public.converter_proposta(p3);
  out := out || ' copiou=' || (select count(*) from estoque.v_materiais_item where venda_id = novo);

  -- Lona: saldo 10−4+1=7; reservado 4 (P1) + 5 (D1) = 9; previsto −2; falta 2; com mínimo 3.
  -- Cola: saldo 5; reservado 2 (D1) + 7 (pedido de P3) = 9; falta 4.
  out := out || ' lona=' || (select concat_ws('/', trim_scale(saldo), trim_scale(reservado), trim_scale(previsto),
    trim_scale(falta), trim_scale(falta_com_minimo)) from estoque.v_previsao where id = lona);
  out := out || ' cola=' || (select concat_ws('/', trim_scale(saldo), trim_scale(reservado), trim_scale(falta))
    from estoque.v_previsao where id = cola);
  out := out || ' propostaSai=' || not exists (select 1 from estoque.v_demanda where venda_id = p3);
  out := out || ' enviadaNaoConta=' || not exists (select 1 from estoque.v_demanda where venda_id = p2);
  out := out || ' concluidoNaoConta=' || not exists (select 1 from estoque.v_demanda where venda_id = d2);

  -- Produção lê a previsão, sem valores.
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' custoProducao=' || coalesce((select ultimo_valor::text from estoque.v_previsao where id = lona), 'null');
  out := out || ' producaoLe=' || exists (select 1 from estoque.v_demanda);

  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  perform estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'Sem mov LI'));
  perform estoque.salvar_lista_material(i2, jsonb_build_array(jsonb_build_object('produto_id',
    (select id from estoque.v_produtos where nome = 'Sem mov LI'), 'quantidade', 1)));
  begin perform estoque.excluir_produto((select id from estoque.v_produtos where nome = 'Sem mov LI'));
    out := out || ' excluiNaLista=ALLOWED';
  exception when foreign_key_violation then out := out || ' excluiNaLista=blocked'; end;
  out := out || ' vazia=' || estoque.salvar_lista_material(i2, '[]');

  perform set_config('role', 'postgres', true);
  delete from vendas_itens where id = i1;
  out := out || ' cascata=' || (select count(*) from estoque.materiais_item where venda_item_id = i1);
  raise exception 'RESULT: %', out;
end $$;
