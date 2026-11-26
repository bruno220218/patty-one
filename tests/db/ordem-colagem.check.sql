-- Self-checking test of migration 0042 (Mídia OOH vira ordem de colagem). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- tipos=Colagem,Colagem,Instalação ponto=t local=t bissemana=t prazo=t etapas=Impressão,Separação do material,Colagem,Foto de comprovação semPonto=t semPeriodo=t padrao=ok usaPadrao=1 pcpEscolhe=t mantem=t bsRuim=blocked bsMeia=blocked pontoRuim=blocked manualColagem=Colagem
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  c uuid; emp uuid; t uuid; p1 uuid; p2 uuid; ped uuid; ped2 uuid; lib uuid; lib2 uuid; ck uuid;
  oc uuid; os uuid; m uuid; bs_ano integer; bs_num integer; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-oc@example.com', '{"display_name":"Comercial OC"}'),
    (pc, 'pc-oc@example.com', '{"display_name":"PCP OC"}');
  delete from user_roles where user_id in (co, pc);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp');

  select id into t from tipos_midia where nome = 'Outdoor';
  insert into pontos_midia (codigo, nome, tipo_id, endereco, cidade) values ('OC-01', 'Outdoor Av. Brasil', t, 'Av. Brasil, 1200', 'BH') returning id into p1;
  insert into pontos_midia (codigo, nome, tipo_id) values ('OC-02', 'Outdoor Raja', t) returning id into p2;
  select ano, numero into bs_ano, bs_num from calendario_bissemanas where date '2026-12-08' between inicio and fim;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  c := salvar_cadastro('{"nome":"Cliente OC"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('categoria', 'Mídia OOH', 'descricao', 'Outdoor', 'ponto', 'oc-01',
        'periodo_inicio', '2026-12-08', 'periodo_fim', '2026-12-21'),
      json_build_object('categoria', 'Mídia OOH', 'descricao', 'Outdoor sem ponto', 'ponto', 'Algum lugar'),
      json_build_object('categoria', 'Produção', 'descricao', 'Fachada')))::jsonb);
  insert into liberacoes (modelo, cliente, venda_id, endereco, data_entrega)
    values ('projeto', 'Cliente OC', ped, 'Rua X', '2026-12-30') returning id into lib;

  out := out || 'tipos=' || (select string_agg(o.tipo, ',' order by i.ordem) from ordens_producao o
                              join vendas_itens i on i.id = o.venda_item_id where o.liberacao_id = lib);
  select o.id into oc from ordens_producao o join vendas_itens i on i.id = o.venda_item_id
  where o.liberacao_id = lib and i.descricao = 'Outdoor';
  select o.id into os from ordens_producao o join vendas_itens i on i.id = o.venda_item_id
  where o.liberacao_id = lib and i.descricao = 'Outdoor sem ponto';
  out := out || ' ponto=' || ((select ponto_id from ordens_producao where id = oc) = p1)
    || ' local=' || ((select local_instalacao from ordens_producao where id = oc) = 'Av. Brasil, 1200, BH')
    || ' bissemana=' || (select bissemana_ano = bs_ano and bissemana_numero = bs_num from ordens_producao where id = oc)
    || ' prazo=' || ((select data_prevista from ordens_producao where id = oc) = '2026-12-08')
    || ' etapas=' || (select string_agg(nome, ',' order by ordem) from ordens_producao_etapas where ordem_id = oc)
    || ' semPonto=' || (select ponto_id is null and local_instalacao = 'Algum lugar' from ordens_producao where id = os)
    || ' semPeriodo=' || (select bissemana_ano is null and data_prevista = '2026-12-30' from ordens_producao where id = os);

  -- Checklist padrão da Colagem: as ordens novas usam.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform set_config('role', 'none', true);
  insert into checklists (name) values ('Colagem OC') returning id into ck;
  insert into checklist_tasks (checklist_id, title, position) values (ck, 'Separar lona', 0), (ck, 'Colar', 1);
  perform set_config('role', 'authenticated', true);
  begin perform definir_checklist_padrao('Colagem', ck); out := out || ' padrao=ok';
  exception when others then out := out || ' padrao=ERRO:' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  ped2 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Mídia OOH', 'descricao', 'Outdoor 2')))::jsonb);
  insert into liberacoes (modelo, cliente, venda_id) values ('projeto', 'Cliente OC', ped2) returning id into lib2;
  out := out || ' usaPadrao=' || (select count(*) from ordens_producao where liberacao_id = lib2 and checklist_id = ck);

  -- O PCP escolhe ponto e bi-semana; salvar sem essas chaves não apaga.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform salvar_ordem_producao(json_build_object('tipo', 'Colagem', 'status', 'Aguardando liberação',
    'descricao', 'Outdoor sem ponto', 'venda_id', ped, 'cadastro_id', c, 'ponto_id', p2,
    'bissemana_ano', bs_ano, 'bissemana_numero', bs_num, 'etapas', json_build_array('a'))::jsonb, os);
  out := out || ' pcpEscolhe=' || (select ponto_id = p2 and bissemana_numero = bs_num from ordens_producao where id = os);
  perform salvar_ordem_producao(json_build_object('tipo', 'Colagem', 'status', 'Aguardando liberação',
    'descricao', 'Outdoor sem ponto', 'venda_id', ped, 'cadastro_id', c, 'etapas', json_build_array('a'))::jsonb, os);
  out := out || ' mantem=' || (select ponto_id = p2 and bissemana_numero = bs_num from ordens_producao where id = os);
  begin
    perform salvar_ordem_producao(json_build_object('tipo', 'Colagem', 'status', 'Aguardando liberação', 'descricao', 'x',
      'bissemana_ano', 1900, 'bissemana_numero', 1, 'etapas', json_build_array('a'))::jsonb, os);
    out := out || ' bsRuim=ALLOWED';
  exception when others then out := out || ' bsRuim=blocked'; end;
  begin
    perform salvar_ordem_producao(json_build_object('tipo', 'Colagem', 'status', 'Aguardando liberação', 'descricao', 'x',
      'bissemana_ano', bs_ano, 'etapas', json_build_array('a'))::jsonb, os);
    out := out || ' bsMeia=ALLOWED';
  exception when others then out := out || ' bsMeia=blocked'; end;
  begin
    perform salvar_ordem_producao(json_build_object('tipo', 'Colagem', 'status', 'Aguardando liberação', 'descricao', 'x',
      'ponto_id', gen_random_uuid(), 'etapas', json_build_array('a'))::jsonb, os);
    out := out || ' pontoRuim=ALLOWED';
  exception when others then out := out || ' pontoRuim=blocked'; end;

  -- Ordem de colagem aberta à mão.
  m := salvar_ordem_producao(json_build_object('tipo', 'Colagem', 'descricao', 'Recolagem', 'motivo_sem_pedido', 'Retrabalho',
    'ponto_id', p1, 'etapas', json_build_array('Colagem'))::jsonb);
  out := out || ' manualColagem=' || (select tipo from ordens_producao where id = m);

  raise exception 'RESULT: %', out;
end;
$$;
