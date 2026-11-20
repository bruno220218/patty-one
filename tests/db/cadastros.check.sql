-- Self-checking test of migration 0018 (cadastros). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- comercialSalva=ok membroVe=true membroSalva=bloqueado bancarioComercial=bloqueado
-- bancarioFinanceiro=ok comercialLeBanco=0 restricaoMantida=true atribuiu=1 importaComercial=bloqueado
-- importaGestao=atualizado excluiComercial=0 excluiGestao=1
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); fi uuid := gen_random_uuid();
  me uuid := gen_random_uuid(); c uuid; n int; r jsonb; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-cad@example.com', '{"display_name":"Gestão Cad"}'),
    (co, 'co-cad@example.com', '{"display_name":"Comercial Cad"}'),
    (fi, 'fi-cad@example.com', '{"display_name":"Financeiro Cad"}'),
    (me, 'me-cad@example.com', '{"display_name":"Membro Cad"}');
  delete from user_roles where user_id in (g, co, fi, me);
  insert into user_roles (user_id, role) values
    (g, 'gestor'), (co, 'comercial'), (fi, 'financeiro'), (me, 'membro');
  perform set_config('role', 'authenticated', true);

  -- Comercial cria; a restrição do SIGE enviada pelo formulário é ignorada.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  c := salvar_cadastro('{"nome":"Cliente Teste Cad","cpf_cnpj":"11.222.333/0001-81","restricao_sige":true}'::jsonb);
  out := out || 'comercialSalva=ok';

  -- Membro vê, mas não altera.
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  out := out || ' membroVe=' || exists (select 1 from cadastros where id = c);
  begin
    perform salvar_cadastro('{"nome":"Outro nome"}'::jsonb, c);
    out := out || ' membroSalva=PASSOU';
  exception when others then out := out || ' membroSalva=bloqueado'; end;

  -- Dados bancários: comercial não, financeiro sim (financeiro não edita cadastro: grava direto).
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin
    perform salvar_cadastro('{"nome":"Cliente Teste Cad","banco":"001"}'::jsonb, c);
    out := out || ' bancarioComercial=PASSOU';
  exception when others then out := out || ' bancarioComercial=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', fi, 'role', 'authenticated')::text, true);
  begin
    insert into cadastros_bancario (cadastro_id, banco, agencia) values (c, '001', '1234');
    out := out || ' bancarioFinanceiro=ok';
  exception when others then out := out || ' bancarioFinanceiro=ERRO:' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  out := out || ' comercialLeBanco=' || (select count(*) from cadastros_bancario where cadastro_id = c);
  out := out || ' restricaoMantida=' || ((select restricao_sige from cadastros where id = c) = false);

  -- Atribuir vendedor.
  n := atribuir_vendedor('Vendedor X', array[c]);
  out := out || ' atribuiu=' || n;

  -- Importação: só gestão.
  begin
    perform importar_cadastros('[{"nome":"Cliente Teste Cad","cpf_cnpj":"11222333000181"}]'::jsonb);
    out := out || ' importaComercial=PASSOU';
  exception when others then out := out || ' importaComercial=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  r := importar_cadastros('[{"linha":2,"nome":"Cliente Importado","cpf_cnpj":"11222333000181"}]'::jsonb);
  out := out || ' importaGestao=' || (r->0->>'resultado');

  -- Excluir: só gestão.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  with d as (delete from cadastros where id = c returning 1) select count(*) into n from d;
  out := out || ' excluiComercial=' || n;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  with d as (delete from cadastros where id = c returning 1) select count(*) into n from d;
  out := out || ' excluiGestao=' || n;

  perform set_config('role', 'none', true);
  raise exception 'RESULT: %', out;
end $$;
