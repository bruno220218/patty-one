-- Self-checking test of migration 0033 (solicitar prazo). Run it as one statement: it always
-- ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- membroPede=blocked pcpPede=blocked pede=ok segundoAberto=blocked passado=blocked avisoPcp=1 escritaDireta=blocked comercialResponde=blocked semData=blocked prazoPassado=blocked responde=ok status=respondido avisoComercial=1 deNovo=blocked novoPedido=ok outroCancela=blocked cancela=ok canceladoResponde=blocked cancelado=blocked membroLe=2
do $$
declare
  co uuid := gen_random_uuid(); co2 uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  mb uuid := gen_random_uuid(); c uuid; emp uuid; ped uuid; ped2 uuid; ped3 uuid; pz uuid; pz2 uuid;
  out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-pz@example.com', '{"display_name":"Comercial PZ"}'),
    (co2, 'co2-pz@example.com', '{"display_name":"Comercial 2 PZ"}'),
    (pc, 'pc-pz@example.com', '{"display_name":"PCP PZ"}'),
    (mb, 'mb-pz@example.com', '{"display_name":"Membro PZ"}');
  delete from user_roles where user_id in (co, co2, pc, mb);
  insert into user_roles (user_id, role) values (co, 'comercial'), (co2, 'comercial'), (pc, 'pcp'), (mb, 'membro');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);

  c := salvar_cadastro('{"nome":"Cliente PZ"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c,
    'status', 'Aberto', 'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Lona')))::jsonb);
  ped3 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c,
    'status', 'Aberto', 'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'z')))::jsonb);
  ped2 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c,
    'status', 'Cancelado', 'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'x')))::jsonb);

  -- Quem pede: comercial e gestão.
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  begin perform solicitar_prazo(ped, null, ''); out := out || 'membroPede=ALLOWED';
  exception when others then out := out || 'membroPede=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin perform solicitar_prazo(ped, null, ''); out := out || ' pcpPede=ALLOWED';
  exception when others then out := out || ' pcpPede=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin
    pz := solicitar_prazo(ped, current_date + 10, '  Cliente quer para o evento  ');
    out := out || ' pede=ok';
  exception when others then out := out || ' pede=ERRO:' || sqlerrm; end;
  begin perform solicitar_prazo(ped, null, ''); out := out || ' segundoAberto=ALLOWED';
  exception when others then out := out || ' segundoAberto=blocked'; end;
  begin perform solicitar_prazo(ped3, current_date - 1, ''); out := out || ' passado=ALLOWED';
  exception when others then out := out || ' passado=blocked'; end;

  perform set_config('role', 'none', true);
  out := out || ' avisoPcp=' || (select count(*) from notifications where recipient_id = pc
                                   and tipo = 'prazo_solicitado' and link = '/comercial/' || ped);
  perform set_config('role', 'authenticated', true);

  begin
    insert into pedido_prazos (venda_id) values (ped);
    out := out || ' escritaDireta=ALLOWED';
  exception when others then out := out || ' escritaDireta=blocked'; end;

  -- Quem responde: PCP e gestão; data obrigatória e não no passado.
  begin perform responder_prazo(pz, current_date + 5, ''); out := out || ' comercialResponde=ALLOWED';
  exception when others then out := out || ' comercialResponde=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin perform responder_prazo(pz, null, ''); out := out || ' semData=ALLOWED';
  exception when others then out := out || ' semData=blocked'; end;
  begin perform responder_prazo(pz, current_date - 1, ''); out := out || ' prazoPassado=ALLOWED';
  exception when others then out := out || ' prazoPassado=blocked'; end;
  begin
    perform responder_prazo(pz, current_date + 12, 'Fila cheia na impressão');
    out := out || ' responde=ok';
  exception when others then out := out || ' responde=ERRO:' || sqlerrm; end;
  out := out || ' status=' || (select status from pedido_prazos where id = pz);

  perform set_config('role', 'none', true);
  out := out || ' avisoComercial=' || (select count(*) from notifications where recipient_id = co
                                         and tipo = 'prazo_definido');
  perform set_config('role', 'authenticated', true);
  begin perform responder_prazo(pz, current_date + 3, ''); out := out || ' deNovo=ALLOWED';
  exception when others then out := out || ' deNovo=blocked'; end;

  -- Depois da resposta, o comercial pode pedir de novo; só quem pediu (ou gestão) cancela.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin pz2 := solicitar_prazo(ped, null, 'Cliente mudou a data'); out := out || ' novoPedido=ok';
  exception when others then out := out || ' novoPedido=ERRO:' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co2, 'role', 'authenticated')::text, true);
  begin perform cancelar_prazo(pz2); out := out || ' outroCancela=ALLOWED';
  exception when others then out := out || ' outroCancela=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform cancelar_prazo(pz2); out := out || ' cancela=ok';
  exception when others then out := out || ' cancela=ERRO:' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin perform responder_prazo(pz2, current_date + 3, ''); out := out || ' canceladoResponde=ALLOWED';
  exception when others then out := out || ' canceladoResponde=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform solicitar_prazo(ped2, null, ''); out := out || ' cancelado=ALLOWED';
  exception when others then out := out || ' cancelado=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  out := out || ' membroLe=' || (select count(*) from pedido_prazos where venda_id = ped);

  raise exception 'RESULT: %', out;
end;
$$;
