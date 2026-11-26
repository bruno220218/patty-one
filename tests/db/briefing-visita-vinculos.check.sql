-- Self-checking test of migration 0041 (briefing e visita ligados ao pedido ou à ordem). Run it as
-- one statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- criaLigado=t diretoBloqueado=blocked naoEncontrado=blocked criacaoLiga=blocked visitaLiga=t
-- herdaPedido=t outroPedido=blocked concluidoLiga=t noPedido=3 naOrdem=3 viaProposta=t membroLe=3 desliga=2
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); cr uuid := gen_random_uuid();
  g uuid := gen_random_uuid(); mb uuid := gen_random_uuid();
  c uuid; emp uuid; prop uuid; ped uuid; ped2 uuid; lib uuid; o uuid;
  b1 uuid; b2 uuid; v1 uuid; nb1 int; nb2 int; nv1 int; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-bv@example.com', '{"display_name":"Comercial BV"}'), (pc, 'pc-bv@example.com', '{"display_name":"PCP BV"}'),
    (cr, 'cr-bv@example.com', '{"display_name":"Criação BV"}'), (g, 'g-bv@example.com', '{"display_name":"Gestão BV"}'),
    (mb, 'mb-bv@example.com', '{"display_name":"Membro BV"}');
  delete from user_roles where user_id in (co, pc, cr, g, mb);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp'), (cr, 'criacao'), (g, 'gestor'), (mb, 'membro');
  perform set_config('role', 'authenticated', true);

  -- Comercial: proposta com um briefing já ligado (feito antes do pedido).
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  c := salvar_cadastro('{"nome":"Cliente BV"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  prop := salvar_venda(json_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Enviada',
    'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Fachada BV')))::jsonb);
  insert into briefings (destino, cliente, titulo, venda_id) values ('criacao', 'Cliente BV', 'Arte da fachada', prop)
    returning id, numero into b1, nb1;
  out := out || 'criaLigado=' || (select venda_id = prop from briefings where id = b1);
  begin
    update briefings set venda_id = null where id = b1;
    out := out || ' diretoBloqueado=ALLOWED';
  exception when others then out := out || ' diretoBloqueado=blocked'; end;
  begin perform vincular_briefing_visita('briefing', -1, prop, null); out := out || ' naoEncontrado=ALLOWED';
  exception when others then out := out || ' naoEncontrado=blocked'; end;

  -- A proposta vira pedido; visita e briefing novos.
  ped := converter_proposta(prop);
  ped2 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'Outro BV')))::jsonb);
  insert into visitas (cliente, endereco) values ('Cliente BV', 'Rua BV, 1') returning id, numero into v1, nv1;
  insert into briefings (destino, cliente, titulo) values ('criacao', 'Cliente BV', 'Letreiro') returning id, numero into b2, nb2;

  -- Criação não liga; comercial liga a visita ao pedido.
  perform set_config('request.jwt.claims', json_build_object('sub', cr, 'role', 'authenticated')::text, true);
  begin perform vincular_briefing_visita('briefing', nb2, ped, null); out := out || ' criacaoLiga=ALLOWED';
  exception when others then out := out || ' criacaoLiga=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  perform vincular_briefing_visita('visita', nv1, ped, null);
  out := out || ' visitaLiga=' || (select venda_id = ped from visitas where id = v1);

  -- A liberação gera a ordem; o PCP liga o briefing só à ordem e ele herda o pedido.
  insert into liberacoes (modelo, cliente, venda_id, endereco, data_entrega)
    values ('projeto', 'Cliente BV', ped, 'Rua BV, 1', '2026-12-20') returning id into lib;
  select id into o from ordens_producao where liberacao_id = lib limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform vincular_briefing_visita('briefing', nb2, null, o);
  out := out || ' herdaPedido=' || (select venda_id = ped and ordem_id = o from briefings where id = b2);
  begin perform vincular_briefing_visita('briefing', nb2, ped2, o); out := out || ' outroPedido=ALLOWED';
  exception when others then out := out || ' outroPedido=blocked'; end;

  -- Concluído também pode ser ligado (a gestão conclui e o PCP liga de novo).
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  update briefings set status = 'concluido' where id = b1;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform vincular_briefing_visita('briefing', nb1, prop, null);
  out := out || ' concluidoLiga=' || (select status = 'concluido' and venda_id = prop from briefings where id = b1);

  -- O pedido mostra o da proposta, a visita e o da ordem; a ordem mostra os mesmos três.
  out := out || ' noPedido=' || (select count(*) from vinculados_briefing_visita(ped, null))
    || ' naOrdem=' || (select count(*) from vinculados_briefing_visita(null, o))
    || ' viaProposta=' || exists (select 1 from vinculados_briefing_visita(null, o) where id = b1);
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  out := out || ' membroLe=' || (select count(*) from vinculados_briefing_visita(ped, null));

  -- Desligar a visita.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  perform vincular_briefing_visita('visita', nv1, null, null);
  out := out || ' desliga=' || (select count(*) from vinculados_briefing_visita(ped, null));

  raise exception 'RESULT: %', out;
end $$;
