-- Self-checking test of migration 0040 (conclusão com conferência e cliente). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- parcial=Em andamento ultima=Aguardando conferência avisoPcp=1 comercialConfere=blocked refazerSemMotivo=blocked refazer=Em andamento ultimaAberta=t denovo=Aguardando conferência conferida=Aguardando cliente conferidoPor=t avisoComercial=1 reabre=Em andamento pcpConfirma=blocked futura=blocked semNome=blocked concluida=Concluída registro=t pedidoAinda=Em andamento pedido=Concluído semPedido=Concluída naoEspera=blocked
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); ge uuid := gen_random_uuid(); pr uuid := gen_random_uuid();
  c uuid; emp uuid; ped uuid; lib uuid; o1 uuid; o2 uuid; m uuid; e uuid; st text; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-co@example.com', '{"display_name":"Comercial CO"}'),
    (pc, 'pc-co@example.com', '{"display_name":"PCP CO"}'),
    (ge, 'ge-co@example.com', '{"display_name":"Gestor CO"}'),
    (pr, 'pr-co@example.com', '{"display_name":"Produção CO"}');
  delete from user_roles where user_id in (co, pc, ge, pr);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp'), (ge, 'gestor'), (pr, 'producao');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);

  c := salvar_cadastro('{"nome":"Cliente CO"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Em andamento',
    'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Fachada'),
                              json_build_object('categoria', 'Produção', 'descricao', 'Placa')))::jsonb);
  insert into liberacoes (modelo, cliente, venda_id) values ('projeto', 'Cliente CO', ped) returning id into lib;
  select o.id into o1 from ordens_producao o join vendas_itens i on i.id = o.venda_item_id where i.descricao = 'Fachada' and i.venda_id = ped;
  select o.id into o2 from ordens_producao o join vendas_itens i on i.id = o.venda_item_id where i.descricao = 'Placa' and i.venda_id = ped;

  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  update liberacoes set status = 'aprovada' where id = lib;

  -- Baixa nas etapas: na última, a ordem vai para a conferência.
  select id into e from ordens_producao_etapas where ordem_id = o1 order by ordem limit 1;
  perform iniciar_etapa_producao(e);
  perform atualizar_etapa_producao(e, true);
  out := out || 'parcial=' || (select status from ordens_producao where id = o1);
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  for e in select id from ordens_producao_etapas where ordem_id = o1 and not concluido order by ordem loop
    perform atualizar_etapa_producao(e, true);
  end loop;
  out := out || ' ultima=' || (select status from ordens_producao where id = o1);
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  out := out || ' avisoPcp=' || (select count(*) from notifications where tipo = 'ordem_conferencia');
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform conferir_ordem_producao(o1, true); out := out || ' comercialConfere=ALLOWED';
  exception when others then out := out || ' comercialConfere=blocked'; end;

  -- PCP manda refazer: precisa do motivo; a última etapa reabre.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin perform conferir_ordem_producao(o1, false, ' '); out := out || ' refazerSemMotivo=ALLOWED';
  exception when others then out := out || ' refazerSemMotivo=blocked'; end;
  st := conferir_ordem_producao(o1, false, 'Acabamento torto');
  out := out || ' refazer=' || st
    || ' ultimaAberta=' || (select not concluido from ordens_producao_etapas where ordem_id = o1 order by ordem desc limit 1);
  select id into e from ordens_producao_etapas where ordem_id = o1 and not concluido;
  perform atualizar_etapa_producao(e, true);
  out := out || ' denovo=' || (select status from ordens_producao where id = o1);
  st := conferir_ordem_producao(o1, true);
  out := out || ' conferida=' || st
    || ' conferidoPor=' || (select conferido_por = pc and conferido_por_nome = 'PCP CO' from ordens_producao where id = o1);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  out := out || ' avisoComercial=' || (select count(*) from notifications where tipo = 'ordem_aguardando_cliente');

  -- Reabrir uma etapa (gestão) enquanto espera o cliente volta para Em andamento.
  perform set_config('request.jwt.claims', json_build_object('sub', ge, 'role', 'authenticated')::text, true);
  perform atualizar_etapa_producao(e, false);
  out := out || ' reabre=' || (select status from ordens_producao where id = o1);
  perform atualizar_etapa_producao(e, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform conferir_ordem_producao(o1, true);

  -- Só o comercial registra a confirmação; data não futura; nome obrigatório.
  begin perform confirmar_cliente_ordem(o1, current_date, 'Sr. João'); out := out || ' pcpConfirma=ALLOWED';
  exception when others then out := out || ' pcpConfirma=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform confirmar_cliente_ordem(o1, current_date + 5, 'Sr. João'); out := out || ' futura=ALLOWED';
  exception when others then out := out || ' futura=blocked'; end;
  begin perform confirmar_cliente_ordem(o1, current_date, ' '); out := out || ' semNome=ALLOWED';
  exception when others then out := out || ' semNome=blocked'; end;
  perform confirmar_cliente_ordem(o1, current_date - 1, 'Sr. João', 'Gostou');
  out := out || ' concluida=' || (select status from ordens_producao where id = o1)
    || ' registro=' || (select cliente_confirmou_nome = 'Sr. João' and cliente_registrado_por = co
                          and cliente_confirmou_em = current_date - 1 and data_conclusao is not null
                        from ordens_producao where id = o1)
    || ' pedidoAinda=' || (select status from vendas where id = ped);

  -- A outra ordem é cancelada pelo PCP: com a primeira concluída, o pedido conclui.
  -- (montado direto: cancelar não conclui; a próxima conclusão confere de novo)
  perform set_config('role', 'none', true);
  update ordens_producao set status = 'Cancelada' where id = o2;
  update ordens_producao set status = 'Aguardando cliente' where id = o1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  perform confirmar_cliente_ordem(o1, current_date, 'Sr. João');
  out := out || ' pedido=' || (select status from vendas where id = ped);

  -- Ordem sem pedido: conferida já conclui.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  m := salvar_ordem_producao('{"tipo":"Impressão","descricao":"Interna","motivo_sem_pedido":"Interno","etapas":["a"]}'::jsonb);
  select id into e from ordens_producao_etapas where ordem_id = m;
  perform atualizar_etapa_producao(e, true);
  out := out || ' semPedido=' || conferir_ordem_producao(m, true);
  begin perform conferir_ordem_producao(m, true); out := out || ' naoEspera=ALLOWED';
  exception when others then out := out || ' naoEspera=blocked'; end;

  raise exception 'RESULT: %', out;
end;
$$;
