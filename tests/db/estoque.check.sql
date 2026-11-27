-- Self-checking test of migration 0046 (estoque, etapa 1). Run it as one statement: it always
-- ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- setores=8 codigos=01.0001,06.0001,06.0002 producaoCria=blocked trocaSetor=blocked saldo=7 custoEstoque=12.5000 custoProducao=null producaoLe=3 diretoTabela=blocked perdaSemMotivo=blocked baixaSemResp=blocked clienteDaOrdem=t excluiComMov=blocked estoqueExcluiMov=blocked importa=1/2/1 negativo=-3 minimo=t
do $$
declare g uuid := gen_random_uuid(); e uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  cli uuid; forn uuid; ord uuid; p1 uuid; p2 uuid; p3 uuid; res jsonb; out text := '';
begin
  insert into auth.users (id, email) values (g, 'g-es@example.com'), (e, 'e-es@example.com'),
    (w, 'w-es@example.com');
  insert into user_roles (user_id, role) values
    (g, 'gestor'), (e, 'membro'), (e, 'estoque'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  insert into cadastros (nome, is_cliente) values ('Cliente ES', true) returning id into cli;
  insert into cadastros (nome, is_fornecedor) values ('Fornecedor ES', true) returning id into forn;
  insert into ordens_producao (tipo, descricao, cadastro_id) values ('Impressão', 'Ordem ES', cli)
    returning id into ord;
  out := 'setores=' || (select count(*) from estoque.setores);

  perform set_config('role', 'authenticated', true);
  -- Estoque creates products; the code follows the sector.
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  p1 := estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'Cola instantânea',
    'unidade', 'un', 'estoque_minimo', 10));
  p2 := estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'Fita dupla face'));
  p3 := estoque.salvar_produto(null, jsonb_build_object('setor', '01', 'nome', 'Lona 440g', 'unidade', 'm²'));
  out := out || ' codigos=' || (select string_agg(codigo, ',' order by created_at, codigo)
    from estoque.v_produtos where id in (p1, p2, p3));
  -- Produção can't create; the sector can't change.
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  begin perform estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'X'));
    out := out || ' producaoCria=ALLOWED';
  exception when insufficient_privilege then out := out || ' producaoCria=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  begin perform estoque.salvar_produto(p1, jsonb_build_object('setor', '01', 'nome', 'Cola instantânea'));
    out := out || ' trocaSetor=ALLOWED';
  exception when invalid_parameter_value then out := out || ' trocaSetor=blocked'; end;

  -- Entrada 10 @ 12.5, Baixa 4, Devolução 1 → 7.
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Entrada', 'produto_id', p1,
    'quantidade', 10, 'valor_unitario', 12.5, 'fornecedor_id', forn, 'lote', 'L1'));
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Baixa', 'produto_id', p1,
    'quantidade', 4, 'responsavel', 'João', 'ordem_id', ord));
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Devolução', 'produto_id', p1,
    'quantidade', 1, 'responsavel', 'João'));
  out := out || ' saldo=' || trim_scale((select quantidade from estoque.v_produtos where id = p1));
  out := out || ' custoEstoque=' || (select custo from estoque.v_produtos where id = p1);
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' custoProducao=' || coalesce((select custo::text from estoque.v_produtos where id = p1), 'null');
  out := out || ' producaoLe=' || (select count(*) from estoque.v_movimentos where produto_id = p1);
  begin perform 1 from estoque.movimentos limit 1; out := out || ' diretoTabela=ALLOWED';
  exception when insufficient_privilege then out := out || ' diretoTabela=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  begin perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Perda', 'produto_id', p1,
      'quantidade', 1, 'responsavel', 'João'));
    out := out || ' perdaSemMotivo=ALLOWED';
  exception when invalid_parameter_value then out := out || ' perdaSemMotivo=blocked'; end;
  begin perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Baixa', 'produto_id', p1,
      'quantidade', 1));
    out := out || ' baixaSemResp=ALLOWED';
  exception when invalid_parameter_value then out := out || ' baixaSemResp=blocked'; end;
  out := out || ' clienteDaOrdem=' || (select bool_and(cliente_id = cli) from estoque.v_movimentos
    where produto_id = p1 and tipo = 'Baixa');
  begin perform estoque.excluir_produto(p1); out := out || ' excluiComMov=ALLOWED';
  exception when foreign_key_violation then out := out || ' excluiComMov=blocked'; end;
  begin perform estoque.excluir_movimento((select id from estoque.v_movimentos where produto_id = p1 limit 1));
    out := out || ' estoqueExcluiMov=ALLOWED';
  exception when insufficient_privilege then out := out || ' estoqueExcluiMov=blocked'; end;

  -- Spreadsheet: existing product by code gets an entry; a new one is created; bad sector = error.
  res := estoque.importar_planilha(jsonb_build_array(
    jsonb_build_object('codigo', '06.0002', 'produto', 'Fita dupla face', 'quantidade', '5'),
    jsonb_build_object('produto', 'Parafuso 4mm', 'setor', 'Serralheria', 'quantidade', '100',
      'custo', '0.10', 'fornecedor', 'Fornecedor ES'),
    jsonb_build_object('produto', 'Sem setor', 'setor', '99', 'quantidade', '1')));
  out := out || ' importa=' || (res->>'criados') || '/' || (res->>'entradas') || '/'
    || jsonb_array_length(res->'erros');

  -- Negative balance is allowed (warning on screen); below minimum is flagged.
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Baixa', 'produto_id', p3,
    'quantidade', 3, 'responsavel', 'Maria'));
  out := out || ' negativo=' || trim_scale((select quantidade from estoque.v_produtos where id = p3));
  out := out || ' minimo=' || (select abaixo_minimo from estoque.v_produtos where id = p1);
  raise exception 'RESULT: %', out;
end $$;
