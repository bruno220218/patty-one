-- Self-checking test of migration 0049 (estoque: preço de referência, unidade barra). Run it as
-- one statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- barra=barra refEstoque=42.0000/referencia refProducao=null importa=1/0/1 refImport=33.0000 dataImport=2026-11-27 entradaVence=50.0000/entrada mantem=42.0000 apaga=null
do $$
declare e uuid := gen_random_uuid(); w uuid := gen_random_uuid(); p uuid; res jsonb; out text := '';
begin
  insert into auth.users (id, email) values (e, 'e-pr@example.com'), (w, 'w-pr@example.com');
  insert into user_roles (user_id, role) values (e, 'membro'), (e, 'estoque'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  p := estoque.salvar_produto(null, jsonb_build_object('setor', '02', 'nome', 'Metalon PR',
    'unidade', 'barra', 'preco_referencia', 42));
  out := 'barra=' || (select unidade from estoque.v_produtos where id = p);
  out := out || ' refEstoque=' || (select custo || '/' || custo_origem from estoque.v_produtos where id = p);
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' refProducao=' || coalesce((select custo::text from estoque.v_produtos where id = p), 'null');
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  res := estoque.importar_planilha(jsonb_build_array(jsonb_build_object('produto', 'Cantoneira PR',
    'setor', '02', 'unidade', 'barra', 'custo', '33', 'data_preco', '2026-11-27')));
  out := out || ' importa=' || (res->>'criados') || '/' || (res->>'entradas') || '/' || (res->>'precos');
  out := out || ' refImport=' || (select custo from estoque.v_produtos where nome = 'Cantoneira PR');
  out := out || ' dataImport=' || (select preco_referencia_data from estoque.v_produtos where nome = 'Cantoneira PR');
  perform estoque.registrar_movimento(jsonb_build_object('tipo', 'Entrada', 'produto_id', p,
    'quantidade', 2, 'valor_unitario', 50));
  out := out || ' entradaVence=' || (select custo || '/' || custo_origem from estoque.v_produtos where id = p);
  perform estoque.salvar_produto(p, jsonb_build_object('nome', 'Metalon PR', 'unidade', 'barra'));
  out := out || ' mantem=' || (select preco_referencia from estoque.v_produtos where id = p);
  perform estoque.salvar_produto(p, jsonb_build_object('nome', 'Metalon PR', 'preco_referencia', ''));
  out := out || ' apaga=' || coalesce((select preco_referencia::text from estoque.v_produtos where id = p), 'null');
  raise exception 'RESULT: %', out;
end $$;
