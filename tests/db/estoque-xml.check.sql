-- Self-checking test of migration 0047 (estoque: XML da NF-e + similares). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- chave=cola super ciano semPar=null,produto,null fornecedor=true importa=true saldoCola=24 custoCola=0.7500 novo=06.0002 similares=2 reconhece=codigo,similar,similar fator=12 duplicada=blocked jaImportada=true producaoImporta=blocked geral=similar_geral notaNoMov=true
do $$
declare e uuid := gen_random_uuid(); w uuid := gen_random_uuid(); forn uuid; cola uuid; nota uuid;
  res jsonb; out text := '';
  chave text := '35251112345678000199550010000012341000012345';
begin
  insert into auth.users (id, email) values (e, 'e-xml@example.com'), (w, 'w-xml@example.com');
  insert into user_roles (user_id, role) values (e, 'membro'), (e, 'estoque'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  insert into cadastros (nome, is_fornecedor, cpf_cnpj, cpf_cnpj_digitos)
    values ('Distribuidora XML', true, '12.345.678/0001-99', '12345678000199') returning id into forn;
  out := 'chave=' || estoque.chave_nome('  COLA  Súper   CIANO ');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  cola := estoque.salvar_produto(null, jsonb_build_object('setor', '06', 'nome', 'Cola instantânea'));

  -- First note: nothing linked yet except the exact product name.
  res := estoque.identificar_itens_nota('12.345.678/0001-99', chave, jsonb_build_array(
    jsonb_build_object('codigo', 'A1', 'nome', 'COLA SUPER CIANO'),
    jsonb_build_object('codigo', 'A2', 'nome', 'COLA INSTANTANEA'),
    jsonb_build_object('codigo', 'A3', 'nome', 'FITA VHB 19MM')));
  out := out || ' semPar=' || (select string_agg(coalesce(i->>'origem', 'null'), ',' order by n)
    from jsonb_array_elements(res->'itens') with ordinality t(i, n));
  out := out || ' fornecedor=' || ((res->>'fornecedor_id')::uuid = forn);

  -- Import: item 1 linked to the cola (box of 12), item 2 same name, item 3 new product, frete ignored.
  nota := estoque.importar_nota(jsonb_build_object('chave', chave, 'numero', '1234', 'serie', '1',
    'emissao', current_date, 'cnpj', '12345678000199', 'fornecedor_nome', 'DISTRIBUIDORA XML LTDA',
    'valor_total', 150, 'itens', jsonb_build_array(
      jsonb_build_object('codigo', 'A1', 'nome', 'COLA SUPER CIANO', 'quantidade', 1,
        'valor_unitario', 9, 'fator', 12, 'produto_id', cola, 'lote', 'L77'),
      jsonb_build_object('codigo', 'A2', 'nome', 'COLA INSTANTANEA', 'quantidade', 12,
        'valor_unitario', 0.75, 'produto_id', cola),
      jsonb_build_object('codigo', 'A3', 'nome', 'FITA VHB 19MM', 'quantidade', 5,
        'valor_unitario', 30, 'novo', jsonb_build_object('setor', '06', 'nome', 'Fita VHB 19mm', 'unidade', 'rolo')),
      jsonb_build_object('codigo', 'FR', 'nome', 'FRETE', 'quantidade', 1, 'ignorar', true))));
  out := out || ' importa=' || (nota is not null);
  out := out || ' saldoCola=' || trim_scale((select quantidade from estoque.v_produtos where id = cola));
  out := out || ' custoCola=' || (select custo from estoque.v_produtos where id = cola);
  out := out || ' novo=' || (select codigo from estoque.v_produtos where nome = 'Fita VHB 19mm');
  -- Similares of the cola: A1 (other name, factor 12) and A2 (same name, but keeps the supplier code).
  out := out || ' similares=' || (select count(*) from estoque.v_similares where produto_id = cola);

  -- Second note from the same supplier: recognized by code and by the supplier names saved from the first note.
  res := estoque.identificar_itens_nota('12345678000199', null, jsonb_build_array(
    jsonb_build_object('codigo', 'A1', 'nome', 'outro nome'),
    jsonb_build_object('codigo', 'ZZ', 'nome', 'cola super ciano'),
    jsonb_build_object('codigo', null, 'nome', 'Cola Instantânea')));
  out := out || ' reconhece=' || (select string_agg(i->>'origem', ',' order by n)
    from jsonb_array_elements(res->'itens') with ordinality t(i, n));
  out := out || ' fator=' || trim_scale((res->'itens'->0->>'fator')::numeric);

  begin perform estoque.importar_nota(jsonb_build_object('chave', chave, 'itens', jsonb_build_array(
      jsonb_build_object('nome', 'X', 'quantidade', 1, 'produto_id', cola))));
    out := out || ' duplicada=ALLOWED';
  exception when unique_violation then out := out || ' duplicada=blocked'; end;
  out := out || ' jaImportada=' || (estoque.identificar_itens_nota(null, chave, '[]')->>'ja_importada');

  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  begin perform estoque.importar_nota(jsonb_build_object('itens', jsonb_build_array(
      jsonb_build_object('nome', 'X', 'quantidade', 1, 'produto_id', cola))));
    out := out || ' producaoImporta=ALLOWED';
  exception when insufficient_privilege then out := out || ' producaoImporta=blocked'; end;

  -- A similar added by hand (no supplier) works for any supplier.
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  perform estoque.salvar_similar(cola, 'Cola muito rápida e boa');
  res := estoque.identificar_itens_nota('99999999000199', null,
    jsonb_build_array(jsonb_build_object('nome', 'COLA MUITO RAPIDA E BOA')));
  out := out || ' geral=' || (res->'itens'->0->>'origem');
  out := out || ' notaNoMov=' || (select bool_and(nota_id = nota) from estoque.v_movimentos
    where produto_id = cola);
  raise exception 'RESULT: %', out;
end $$;
