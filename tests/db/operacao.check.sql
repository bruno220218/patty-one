-- Self-checking test of migration 0019 (operação). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- pcpCadastra=ok comercialOrdem=bloqueado ordem=ok etapasCriadas=3 producaoOrdem=bloqueado
-- producaoEtapa=ok concluirIncompleta=bloqueado etapaDireta=bloqueado concluiu=Concluída autorEvento=PCP Op
-- conflito=bloqueado urgenciaNaReserva=ok equipePreenche=2 lote=2 producaoLote=bloqueado
-- producaoStatus=Concluído colabUsado=desativado anexoProg=ok
do $$
declare
  g uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); co uuid := gen_random_uuid(); pr uuid := gen_random_uuid();
  c1 uuid; c2 uuid; c3 uuid; v1 uuid; eq uuid; o uuid; e uuid; s uuid; n int; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-op@example.com', '{"display_name":"Gestão Op"}'), (pc, 'pc-op@example.com', '{"display_name":"PCP Op"}'),
    (co, 'co-op@example.com', '{"display_name":"Comercial Op"}'), (pr, 'pr-op@example.com', '{"display_name":"Produção Op"}');
  delete from user_roles where user_id in (g, pc, co, pr);
  insert into user_roles (user_id, role) values (g, 'gestor'), (pc, 'pcp'), (co, 'comercial'), (pr, 'producao');
  update profiles set display_name = 'PCP Op' where id = pc;
  perform set_config('role', 'authenticated', true);

  -- PCP cadastra colaboradores, veículo e equipe.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  insert into producao_colaboradores (nome) values ('Ana Teste Op') returning id into c1;
  insert into producao_colaboradores (nome) values ('Beto Teste Op') returning id into c2;
  insert into producao_colaboradores (nome) values ('Caio Teste Op') returning id into c3;
  insert into producao_veiculos (placa, modelo) values ('TST0P01', 'Furgão') returning id into v1;
  eq := salvar_equipe_producao(json_build_object('nome', 'Equipe Op', 'setor', 'Externa', 'capacidade_horas_dia', 8,
    'colaboradores', json_build_array(c1, c2), 'veiculos', json_build_array(v1))::jsonb);
  out := out || 'pcpCadastra=ok';

  -- Ordem: comercial não cria; PCP cria com 3 etapas.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin
    perform salvar_ordem_producao('{"tipo":"Impressão","descricao":"x","etapas":["a"]}'::jsonb);
    out := out || ' comercialOrdem=PASSOU';
  exception when others then out := out || ' comercialOrdem=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  o := salvar_ordem_producao(json_build_object('tipo', 'Instalação', 'descricao', 'Fachada teste', 'motivo_sem_pedido', 'Interno',
    'local_instalacao', 'Rua A', 'etapas', json_build_array('Preparação', 'Instalação', 'Conferência'),
    'equipe', json_build_array(c1))::jsonb);
  out := out || ' ordem=ok etapasCriadas=' || (select count(*) from ordens_producao_etapas where ordem_id = o);

  -- Produção não edita a ordem, mas marca etapas.
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  begin
    perform salvar_ordem_producao(json_build_object('tipo', 'Instalação', 'descricao', 'y', 'local_instalacao', 'z',
      'etapas', json_build_array('a'))::jsonb, o);
    out := out || ' producaoOrdem=PASSOU';
  exception when others then out := out || ' producaoOrdem=bloqueado'; end;
  select id into e from ordens_producao_etapas where ordem_id = o order by ordem limit 1;
  perform atualizar_etapa_producao(e, true);
  out := out || ' producaoEtapa=ok';

  -- Concluir só com todas as etapas.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin
    perform salvar_ordem_producao(json_build_object('tipo', 'Instalação', 'status', 'Concluída', 'descricao', 'Fachada teste',
      'local_instalacao', 'Rua A', 'etapas', json_build_array('x'))::jsonb, o);
    out := out || ' concluirIncompleta=PASSOU';
  exception when others then out := out || ' concluirIncompleta=bloqueado'; end;
  begin
    update ordens_producao_etapas set concluido = true where ordem_id = o;
    out := out || ' etapaDireta=PASSOU';
  exception when others then out := out || ' etapaDireta=bloqueado'; end;
  for e in select id from ordens_producao_etapas where ordem_id = o and not concluido loop
    perform atualizar_etapa_producao(e, true);
  end loop;
  perform salvar_ordem_producao(json_build_object('tipo', 'Instalação', 'status', 'Concluída', 'descricao', 'Fachada teste',
    'local_instalacao', 'Rua A', 'etapas', json_build_array('x'))::jsonb, o);
  out := out || ' concluiu=' || (select status from ordens_producao where id = o);
  out := out || ' autorEvento=' || (select created_by_nome from ordens_producao_eventos where ordem_id = o and tipo = 'status' limit 1);

  -- Cronograma: conflito de veículo bloqueia; urgência pode usar a reserva de urgência.
  perform salvar_planejamento(json_build_object('titulo', 'Trabalho 1', 'data_inicio', '2030-01-10', 'data_fim', '2030-01-10',
    'veiculo_id', v1)::jsonb);
  begin
    perform salvar_planejamento(json_build_object('titulo', 'Trabalho 2', 'data_inicio', '2030-01-10', 'data_fim', '2030-01-10',
      'veiculo_id', v1)::jsonb);
    out := out || ' conflito=PASSOU';
  exception when others then out := out || ' conflito=bloqueado'; end;
  perform salvar_planejamento(json_build_object('titulo', 'Reserva', 'tipo', 'Reserva de urgência', 'data_inicio', '2030-01-11',
    'data_fim', '2030-01-11', 'equipe', json_build_array(c3))::jsonb);
  begin
    perform salvar_planejamento(json_build_object('titulo', 'Urgente', 'tipo', 'Urgência', 'data_inicio', '2030-01-11',
      'data_fim', '2030-01-11', 'equipe', json_build_array(c3))::jsonb);
    out := out || ' urgenciaNaReserva=ok';
  exception when others then out := out || ' urgenciaNaReserva=ERRO:' || sqlerrm; end;
  -- Equipe preenche os colaboradores do agendamento.
  s := salvar_planejamento(json_build_object('titulo', 'Com equipe', 'data_inicio', '2030-02-01', 'data_fim', '2030-02-01',
    'equipe_id', eq)::jsonb);
  out := out || ' equipePreenche=' || (select count(*) from planejamento_agendamento_equipe where agendamento_id = s);

  -- Programação: PCP lança em lote; Produção não lança, mas muda a situação.
  n := salvar_programacao_lote(json_build_array(
    json_build_object('data', '2030-03-01', 'setor', 'Externa', 'servico', 'Colagem', 'lider_id', c1, 'ajudantes', json_build_array(c2)),
    json_build_object('data', '2030-03-01', 'setor', 'Corte', 'servico', 'Cortar'))::jsonb);
  out := out || ' lote=' || n;
  select id into s from programacao_servicos where data = '2030-03-01' and setor = 'Externa';
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  begin
    perform salvar_programacao_lote(json_build_array(json_build_object('data', '2030-03-02', 'setor', 'Corte', 'servico', 'x'))::jsonb);
    out := out || ' producaoLote=PASSOU';
  exception when others then out := out || ' producaoLote=bloqueado'; end;
  perform atualizar_status_programacao(s, 'Concluído');
  out := out || ' producaoStatus=' || (select status from programacao_servicos where id = s);

  -- Colaborador com histórico só é desativado; imagem do serviço vira anexo.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  out := out || ' colabUsado=' || excluir_colaborador(c2);
  begin
    insert into anexos (entidade, entidade_id, url, nome, tipo) values ('programacao', s, 'https://drive.google.com/x', 'foto.jpg', 'foto');
    out := out || ' anexoProg=ok';
  exception when others then out := out || ' anexoProg=ERRO:' || sqlerrm; end;

  perform set_config('role', 'none', true);
  raise exception 'RESULT: %', out;
end $$;
