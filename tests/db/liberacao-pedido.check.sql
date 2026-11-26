-- Self-checking test of migration 0032 (liberação ligada ao pedido e ao cadastro). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- semMotivo=blocked motivoRuim=blocked comMotivo=ok pedido=ok cadastroDoPedido=t motivoLimpo=t segunda=blocked proposta=blocked cancelado=blocked urgenciaLiga=t pcpNaoMuda=t aprovada=t tirarSemMotivo=blocked antigaEdita=ok
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  c uuid; c2 uuid; emp uuid; prop uuid; ped uuid; ped2 uuid; ped3 uuid;
  lib uuid; urg uuid; antiga uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-lp@example.com', '{"display_name":"Comercial LP"}'),
    (pc, 'pc-lp@example.com', '{"display_name":"PCP LP"}');
  delete from user_roles where user_id in (co, pc);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);

  c := salvar_cadastro('{"nome":"Cliente LP"}'::jsonb);
  c2 := salvar_cadastro('{"nome":"Outro Cliente LP"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  prop := salvar_venda(json_build_object('tipo', 'proposta', 'empresa_id', emp, 'cadastro_id', c,
    'status', 'Enviada', 'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'x')))::jsonb);
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c,
    'status', 'Aberto', 'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Lona')))::jsonb);
  ped2 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c,
    'status', 'Aberto', 'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Placa')))::jsonb);
  ped3 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c,
    'status', 'Cancelado', 'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'y')))::jsonb);

  -- Sem pedido: motivo obrigatório e da lista.
  begin insert into liberacoes (modelo, cliente) values ('projeto', 'Sem motivo'); out := out || 'semMotivo=ALLOWED';
  exception when others then out := out || 'semMotivo=blocked'; end;
  begin insert into liberacoes (modelo, cliente, motivo_sem_pedido) values ('projeto', 'X', 'Qualquer');
    out := out || ' motivoRuim=ALLOWED';
  exception when others then out := out || ' motivoRuim=blocked'; end;
  begin insert into liberacoes (modelo, cliente, motivo_sem_pedido) values ('projeto', 'Interno', 'Interno');
    out := out || ' comMotivo=ok';
  exception when others then out := out || ' comMotivo=ERRO:' || sqlerrm; end;

  -- Com pedido: o cadastro vem do pedido e o motivo é limpo.
  begin
    insert into liberacoes (modelo, cliente, venda_id, cadastro_id, motivo_sem_pedido)
      values ('projeto', 'Cliente LP', ped, c2, 'Garantia') returning id into lib;
    out := out || ' pedido=ok';
  exception when others then out := out || ' pedido=ERRO:' || sqlerrm; end;
  out := out || ' cadastroDoPedido=' || ((select cadastro_id from liberacoes where id = lib) = c)
             || ' motivoLimpo=' || ((select motivo_sem_pedido from liberacoes where id = lib) = '');

  -- Uma liberação por pedido; só pedido (não proposta); pedido cancelado não.
  begin insert into liberacoes (modelo, cliente, venda_id) values ('projeto', 'Dup', ped); out := out || ' segunda=ALLOWED';
  exception when others then out := out || ' segunda=blocked'; end;
  begin insert into liberacoes (modelo, cliente, venda_id) values ('projeto', 'Prop', prop); out := out || ' proposta=ALLOWED';
  exception when others then out := out || ' proposta=blocked'; end;
  begin insert into liberacoes (modelo, cliente, venda_id) values ('projeto', 'Canc', ped3); out := out || ' cancelado=ALLOWED';
  exception when others then out := out || ' cancelado=blocked'; end;

  -- Urgência: o pedido entra depois e o motivo sai.
  insert into liberacoes (modelo, cliente, motivo_sem_pedido) values ('projeto', 'Urgente', 'Urgência') returning id into urg;
  update liberacoes set venda_id = ped2 where id = urg;
  out := out || ' urgenciaLiga=' || (select venda_id = ped2 and motivo_sem_pedido = '' and cadastro_id = c
                                       from liberacoes where id = urg);

  -- PCP aprova, mas não mexe na ligação.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  update liberacoes set status = 'aprovada', venda_id = null, motivo_sem_pedido = 'Interno' where id = lib;
  out := out || ' pcpNaoMuda=' || (select venda_id = ped and motivo_sem_pedido = '' from liberacoes where id = lib)
             || ' aprovada=' || ((select status from liberacoes where id = lib) = 'aprovada');

  -- Comercial não tira o pedido sem dar o motivo.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin update liberacoes set venda_id = null where id = urg; out := out || ' tirarSemMotivo=ALLOWED';
  exception when others then out := out || ' tirarSemMotivo=blocked'; end;

  -- Liberação antiga (de antes da 0032: sem pedido e sem motivo) continua editável.
  perform set_config('role', 'none', true);
  perform set_config('session_replication_role', 'replica', true);
  insert into liberacoes (modelo, cliente, created_by) values ('projeto', 'Antiga', co) returning id into antiga;
  perform set_config('session_replication_role', 'origin', true);
  perform set_config('role', 'authenticated', true);
  begin
    update liberacoes set cliente = 'Antiga editada', venda_id = null, cadastro_id = null, motivo_sem_pedido = ''
     where id = antiga;
    out := out || ' antigaEdita=' || case when (select cliente from liberacoes where id = antiga) = 'Antiga editada'
                                          then 'ok' else 'NAO_GRAVOU' end;
  exception when others then out := out || ' antigaEdita=ERRO:' || sqlerrm; end;

  raise exception 'RESULT: %', out;
end;
$$;
