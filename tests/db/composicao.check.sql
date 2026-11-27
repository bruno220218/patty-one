-- Self-checking test of migration 0050 (composição de custo do orçamento). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- catalogo=19 config=0.5500/0.5900/0.6200/50.00 comercialVe=true producaoVeCatalogo=0 comercialCompoe=blocked salva=3/2 duasSecoes=2 total=60 reservado=6 valorProducao=null custos=2 aplica=50.00 tocou=true copiou=3/2 producaoMudaConfig=0 gestorMudaConfig=0.5000 lista0048=1
do $$
declare g uuid := gen_random_uuid(); pj uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); emp uuid; cli uuid; fita uuid; acm uuid; prop uuid; it uuid;
  novo uuid; mod uuid; antes timestamptz; res jsonb; n integer; out text := '';
begin
  insert into auth.users (id, email) values (g, 'g-co@example.com'), (pj, 'pj-co@example.com'),
    (c, 'c-co@example.com'), (w, 'w-co@example.com');
  insert into user_roles (user_id, role) values (g, 'gestor'), (pj, 'membro'), (pj, 'projetos_especiais'),
    (c, 'membro'), (c, 'comercial'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  select id into emp from empresas order by nome limit 1;
  insert into cadastros (nome, is_cliente) values ('Cliente CO', true) returning id into cli;
  insert into vendas (tipo, empresa_id, cadastro_id, status) values ('proposta', emp, cli, 'Aprovada')
    returning id into prop;
  insert into vendas_itens (venda_id, ordem, categoria, descricao, quantidade)
    values (prop, 1, 'Produção', 'Fachada ACM', 2) returning id into it;
  select updated_at into antes from vendas where id = prop;
  out := 'catalogo=' || (select count(*) from orcamento_custos);
  out := out || ' config=' || (select concat_ws('/', fator_venda, fator_desconto, fator_sem_nota, entrada_pct) from orcamento_config);
  select id into mod from orcamento_custos where nome = 'Serralheria';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  fita := estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'Fita CO', 'preco_referencia', 10));
  acm := estoque.salvar_produto(null, jsonb_build_object('setor', '05', 'nome', 'ACM CO', 'unidade', 'chapa', 'preco_referencia', 480));

  -- Comercial vê custo (pode orçar), produção não; comercial não monta a composição.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  out := out || ' comercialVe=' || ((select custo from estoque.v_produtos where id = acm) = 480);
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' producaoVeCatalogo=' || (select count(*) from orcamento_custos);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin perform estoque.salvar_composicao(it, '{}');
    out := out || ' comercialCompoe=ALLOWED';
  exception when insufficient_privilege then out := out || ' comercialCompoe=blocked'; end;

  -- Projetos: fita no Painel (2) e no Letreiro (1+3 somam), ACM; serralheria 0,1 h + linha livre.
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  res := estoque.salvar_composicao(it, jsonb_build_object(
    'materiais', jsonb_build_array(
      jsonb_build_object('produto_id', fita, 'secao', 'Painel', 'quantidade', 2, 'valor_unitario', 10),
      jsonb_build_object('produto_id', fita, 'secao', 'Letreiro', 'quantidade', 1, 'valor_unitario', 10),
      jsonb_build_object('produto_id', fita, 'secao', 'Letreiro', 'quantidade', 3, 'valor_unitario', 10),
      jsonb_build_object('produto_id', acm, 'secao', 'Painel', 'quantidade', 0.0125, 'valor_unitario', 480)),
    'custos', jsonb_build_array(
      jsonb_build_object('custo_id', mod, 'descricao', 'Serralheria', 'unidade', 'h', 'quantidade', 0.1, 'valor_unitario', 260.08),
      jsonb_build_object('secao', 'Letreiro', 'descricao', 'Pintura terceirizada', 'quantidade', 1, 'valor_unitario', 3.99))));
  out := out || ' salva=' || (res->>'materiais') || '/' || (res->>'custos');
  out := out || ' duasSecoes=' || (select count(*) from estoque.v_materiais_item where venda_item_id = it and produto_id = fita);
  -- 6 fitas × 10 = 60 (o ACM 0,0125 × 480 = 6 fica fora desta soma).
  out := out || ' total=' || trim_scale((select sum(quantidade * valor_unitario) from estoque.v_materiais_item
    where venda_item_id = it and produto_id = fita));
  out := out || ' reservado=' || trim_scale((select reservado from estoque.v_previsao where id = fita));
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' valorProducao=' || coalesce((select max(valor_unitario)::text from estoque.v_materiais_item where venda_item_id = it), 'null');
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  out := out || ' custos=' || (select count(*) from vendas_itens_custos where venda_item_id = it);

  -- Usar no item: total 100 ÷ 2 unidades = 50; o documento é "tocado" para a tela recarregar.
  out := out || ' aplica=' || estoque.aplicar_preco_item(it, 100);
  perform set_config('role', 'postgres', true);
  out := out || ' tocou=' || ((select updated_at from vendas where id = prop) >= antes);

  -- Proposta aprovada vira pedido: materiais e custos vão juntos.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  update vendas set status = 'Enviada' where id = prop;
  novo := public.converter_proposta(prop);
  out := out || ' copiou=' || (select count(*) from estoque.v_materiais_item where venda_id = novo) || '/'
    || (select count(*) from vendas_itens_custos vc join vendas_itens vi on vi.id = vc.venda_item_id where vi.venda_id = novo);

  -- Configuração: produção não muda (0 linhas), gestão muda.
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  update orcamento_config set fator_venda = 0.4;
  get diagnostics n = row_count;
  out := out || ' producaoMudaConfig=' || n;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  update orcamento_config set fator_venda = 0.5;
  get diagnostics n = row_count;
  out := out || ' gestorMudaConfig=' || (select fator_venda from orcamento_config) || '';
  -- A lista simples da 0048 ainda funciona.
  out := out || ' lista0048=' || estoque.salvar_lista_material(it, jsonb_build_array(jsonb_build_object('produto_id', acm, 'quantidade', 1)));
  raise exception 'RESULT: %', out;
end $$;
