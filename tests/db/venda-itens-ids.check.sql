-- Self-checking test of migration 0034 (itens do pedido com identidade fixa). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- mantido=t atualizado=t removido=t novo=1 ordem=1,2 total=2 alheio=t alheioIntacto=t repetido=2 semIds=2 trocados=t idRuim=1 pcpSalva=blocked
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  c uuid; emp uuid; ped uuid; outro uuid; a uuid; b uuid; x uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-vi@example.com', '{"display_name":"Comercial VI"}'),
    (pc, 'pc-vi@example.com', '{"display_name":"PCP VI"}');
  delete from user_roles where user_id in (co, pc);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);

  c := salvar_cadastro('{"nome":"Cliente VI"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('categoria', 'Produção', 'descricao', 'Fachada'),
      json_build_object('categoria', 'Serviço', 'descricao', 'Frete')))::jsonb);
  outro := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'Outro')))::jsonb);
  select id into a from vendas_itens where venda_id = ped and descricao = 'Fachada';
  select id into b from vendas_itens where venda_id = ped and descricao = 'Frete';
  select id into x from vendas_itens where venda_id = outro;

  -- Mantém o item A (mudando a descrição), remove o B e cria um novo.
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('categoria', 'Serviço', 'descricao', 'Instalação'),
      json_build_object('id', a, 'categoria', 'Produção', 'descricao', 'Fachada ACM', 'quantidade', 2)))::jsonb, ped);
  out := out || 'mantido=' || exists (select 1 from vendas_itens where id = a and venda_id = ped)
             || ' atualizado=' || ((select descricao || '/' || quantidade::int from vendas_itens where id = a) = 'Fachada ACM/2')
             || ' removido=' || (not exists (select 1 from vendas_itens where id = b))
             || ' novo=' || (select count(*) from vendas_itens where venda_id = ped and descricao = 'Instalação')
             || ' ordem=' || (select string_agg(ordem::text, ',' order by ordem) from vendas_itens where venda_id = ped)
             || ' total=' || (select count(*) from vendas_itens where venda_id = ped);

  -- Id de item de outro pedido não é "roubado": vira item novo e o outro pedido fica intacto.
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('id', a, 'categoria', 'Produção', 'descricao', 'Fachada ACM'),
      json_build_object('id', x, 'categoria', 'Serviço', 'descricao', 'Copiado')))::jsonb, ped);
  out := out || ' alheio=' || exists (select 1 from vendas_itens where venda_id = ped and descricao = 'Copiado' and id <> x)
             || ' alheioIntacto=' || ((select venda_id || '/' || descricao from vendas_itens where id = x) = outro || '/Outro');

  -- O mesmo id duas vezes: o primeiro mantém o id, o segundo vira item novo.
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('id', a, 'categoria', 'Produção', 'descricao', 'Fachada ACM'),
      json_build_object('id', a, 'categoria', 'Produção', 'descricao', 'Fachada cópia')))::jsonb, ped);
  out := out || ' repetido=' || (select count(*) from vendas_itens where venda_id = ped);

  -- Sem ids (app antigo): todos os itens são trocados, como antes.
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('categoria', 'Produção', 'descricao', 'Um'),
      json_build_object('categoria', 'Produção', 'descricao', 'Dois')))::jsonb, ped);
  out := out || ' semIds=' || (select count(*) from vendas_itens where venda_id = ped)
             || ' trocados=' || (not exists (select 1 from vendas_itens where id = a));

  -- Id que nem é uuid vira item novo, sem erro.
  perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('id', 'abc', 'categoria', 'Produção', 'descricao', 'Três')))::jsonb, ped);
  out := out || ' idRuim=' || (select count(*) from vendas_itens where venda_id = ped);

  -- Continua só para comercial e gestão.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin
    perform salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
      'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'PCP')))::jsonb, ped);
    out := out || ' pcpSalva=ALLOWED';
  exception when others then out := out || ' pcpSalva=blocked'; end;

  raise exception 'RESULT: %', out;
end;
$$;
