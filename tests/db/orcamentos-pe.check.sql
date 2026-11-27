-- Self-checking test of migration 0052 (orçamento de Projetos Especiais como a planilha). Run it as
-- one statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- numero=1/2 linhas=38/14 acmLigado=true acmCusto=500.0000 adesivoFixo=25.4800 producaoCria=blocked vazio=blocked salva=true rev=1 travado=blocked comercialGera=blocked devolvido=devolvido fechado=aprovado proposta=1/350.01 material=1 previsao=1 ajuste=em_orcamento atualiza=409.84 mesmaProposta=true decidida=blocked producaoLe=0 briefing=true
do $$
declare g uuid := gen_random_uuid(); pj uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); emp uuid; cli uuid; acm uuid; o1 uuid; o2 uuid; b uuid; v uuid; v2 uuid;
  dados jsonb; out text := '';
begin
  insert into auth.users (id, email) values (g, 'g-pe@example.com'), (pj, 'pj-pe@example.com'),
    (c, 'c-pe@example.com'), (w, 'w-pe@example.com');
  insert into user_roles (user_id, role) values (g, 'gestor'), (pj, 'membro'), (pj, 'projetos_especiais'),
    (c, 'membro'), (c, 'comercial'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  select id into emp from empresas order by nome limit 1;
  insert into cadastros (nome, is_cliente) values ('Cliente PE', true) returning id into cli;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  acm := estoque.salvar_produto(null, jsonb_build_object('setor', '05', 'nome', 'ACM 1.22', 'unidade', 'chapa', 'preco_referencia', 500));
  perform estoque.salvar_produto(null, jsonb_build_object('setor', '01', 'nome', 'ADESIVO BRILHO 1,06', 'unidade', 'm²', 'preco_referencia', 7.2));

  -- Projetos cria: o escopo vem montado (38 linhas do modelo + 14 de mão de obra/deslocamento).
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  o1 := public.criar_orcamento_pe();
  o2 := public.criar_orcamento_pe();
  out := 'numero=' || (select numero from orcamentos where id = o1) || '/' || (select numero from orcamentos where id = o2);
  out := out || ' linhas=' || (select count(*) from orcamentos_linhas where orcamento_id = o1 and custo_id is null)
    || '/' || (select count(*) from orcamentos_linhas where orcamento_id = o1 and custo_id is not null);
  out := out || ' acmLigado=' || ((select produto_id from orcamentos_linhas where orcamento_id = o1 and descricao = 'ACM 1.22') = acm);
  out := out || ' acmCusto=' || (select valor_unitario from orcamentos_linhas where orcamento_id = o1 and descricao = 'ACM 1.22');
  out := out || ' adesivoFixo=' || (select valor_unitario from orcamentos_linhas where orcamento_id = o1 and descricao like 'ADESIVO BRILHO%');

  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  begin perform public.criar_orcamento_pe();
    out := out || ' producaoCria=ALLOWED';
  exception when insufficient_privilege then out := out || ' producaoCria=blocked'; end;

  -- Sem quantidades não envia; depois: 0,5 chapa de ACM (250) + 1 h de "Orçamentos" a 42,50 = 292,50.
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  begin perform public.enviar_orcamento_pe(o1);
    out := out || ' vazio=ALLOWED';
  exception when invalid_parameter_value then out := out || ' vazio=blocked'; end;
  select jsonb_build_object('cliente', 'Loja PE', 'informacoes', 'Fachada', 'endereco', 'Rua 1',
    'responsavel', 'Projetista', 'linhas', jsonb_agg(jsonb_build_object('secao', secao, 'descricao', descricao,
      'unidade', unidade, 'produto_id', produto_id, 'custo_id', custo_id, 'valor_unitario', valor_unitario,
      'quantidade', case when descricao = 'ACM 1.22' then 0.5 when descricao = 'Orçamentos' then 1 else 0 end,
      'observacao', observacao) order by secao, ordem))
  into dados from orcamentos_linhas where orcamento_id = o1;
  dados := jsonb_set(dados, '{linhas}', (select jsonb_agg(case when l->>'descricao' = 'Orçamentos'
    then jsonb_set(l, '{valor_unitario}', '42.5') else l end) from jsonb_array_elements(dados->'linhas') l));
  perform public.salvar_orcamento_pe(o1, dados);
  out := out || ' salva=' || ((select cliente from orcamentos where id = o1) = 'Loja PE');
  out := out || ' rev=' || public.enviar_orcamento_pe(o1);
  begin perform public.salvar_orcamento_pe(o1, dados);
    out := out || ' travado=ALLOWED';
  exception when check_violation then out := out || ' travado=blocked'; end;

  -- Comercial não gera antes de fechar; Gestão devolve, Projetos reenvia, Gestão fecha.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin perform public.gerar_proposta_orcamento_pe(o1, cli, emp);
    out := out || ' comercialGera=ALLOWED';
  exception when check_violation then out := out || ' comercialGera=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.decidir_orcamento_pe(o1, false, 'Conferir ACM');
  out := out || ' devolvido=' || (select situacao from orcamentos where id = o1);
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  perform public.enviar_orcamento_pe(o1);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.decidir_orcamento_pe(o1, true);
  out := out || ' fechado=' || (select situacao from orcamentos where id = o1);

  -- Fator de venda ajustado para a conta ficar redonda: 292,50 ÷ 0,8357 = 350,01.
  perform set_config('role', 'postgres', true);
  update orcamento_config set fator_venda = 0.8357;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  v := public.gerar_proposta_orcamento_pe(o1, cli, emp, 'venda');
  out := out || ' proposta=' || (select count(*) from vendas_itens where venda_id = v) || '/'
    || (select valor_unitario from vendas_itens where venda_id = v)::numeric(14,2);
  out := out || ' material=' || (select count(*) from estoque.v_materiais_item where venda_id = v and produto = 'ACM 1.22');
  out := out || ' previsao=' || (select count(*) from estoque.v_materiais_item where venda_id = v);

  -- Cliente pede ajuste: volta para Projetos; depois de fechar de novo, gerar atualiza a mesma proposta.
  perform public.reabrir_orcamento_pe(o1, 'Mais 0,1 chapa');
  out := out || ' ajuste=' || (select situacao from orcamentos where id = o1);
  perform set_config('request.jwt.claims', json_build_object('sub', pj, 'role', 'authenticated')::text, true);
  dados := jsonb_set(dados, '{linhas}', (select jsonb_agg(case when l->>'descricao' = 'ACM 1.22'
    then jsonb_set(l, '{quantidade}', '0.6') else l end) from jsonb_array_elements(dados->'linhas') l));
  perform public.salvar_orcamento_pe(o1, dados);
  perform public.enviar_orcamento_pe(o1);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.decidir_orcamento_pe(o1, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  v2 := public.gerar_proposta_orcamento_pe(o1, null, null, 'venda');
  -- 0,6 × 500 + 42,50 = 342,50 ÷ 0,8357 = 409,84
  out := out || ' atualiza=' || (select valor_unitario from vendas_itens where venda_id = v)::numeric(14,2);
  out := out || ' mesmaProposta=' || (v2 = v);
  update vendas set status = 'Recusada' where id = v;
  begin perform public.reabrir_orcamento_pe(o1, 'x');
    out := out || ' decidida=ALLOWED';
  exception when invalid_parameter_value then out := out || ' decidida=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' producaoLe=' || (select count(*) from orcamentos);

  -- Do briefing de orçamento: cliente e informações vêm dele.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into briefings (destino, titulo, cliente) values ('projetos_especiais', 'Totem', 'Padaria PE') returning id into b;
  o2 := public.criar_orcamento_pe(b);
  out := out || ' briefing=' || ((select cliente from orcamentos where id = o2) = 'Padaria PE');
  raise exception 'RESULT: %', out;
end $$;
