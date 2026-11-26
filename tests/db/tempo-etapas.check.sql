-- Self-checking test of migration 0035 (tempo das etapas). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- complexidadeInvalida=bloqueado complexidade=Complexa comercialInicia=bloqueado inicia=ok situacao=Em andamento
-- pessoas=2 iniciaDeNovo=bloqueado pausaSemMotivo=bloqueado pausa=ok pausaSemAberto=bloqueado reinicia=1
-- escritaDireta=bloqueado baixa=ok abertos=0 fimTipo=conclusao iniciaConcluida=bloqueado horas=5.000 trechos=2
-- amostraComplexidade=Complexa membroLe=1 especialidade=Corte e dobra ACM:2.00 cancelaFecha=0 motivoCancela=Ordem cancelada
do $$
declare
  pc uuid := gen_random_uuid(); co uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); mb uuid := gen_random_uuid();
  c1 uuid; c2 uuid; c3 uuid; o uuid; e1 uuid; e2 uuid; a1 uuid; a2 uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (pc, 'pc-te@example.com', '{"display_name":"PCP TE"}'), (co, 'co-te@example.com', '{"display_name":"Comercial TE"}'),
    (pr, 'pr-te@example.com', '{"display_name":"Produção TE"}'), (mb, 'mb-te@example.com', '{"display_name":"Membro TE"}');
  delete from user_roles where user_id in (pc, co, pr, mb);
  insert into user_roles (user_id, role) values (pc, 'pcp'), (co, 'comercial'), (pr, 'producao'), (mb, 'membro');
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  insert into producao_colaboradores (nome) values ('Ana Teste TE') returning id into c1;
  insert into producao_colaboradores (nome) values ('Beto Teste TE') returning id into c2;
  insert into producao_colaboradores (nome) values ('Caio Teste TE') returning id into c3;
  begin
    perform salvar_ordem_producao('{"tipo":"Impressão","descricao":"x","complexidade":"Altíssima","etapas":["a"]}'::jsonb);
    out := out || 'complexidadeInvalida=PASSOU';
  exception when others then out := out || 'complexidadeInvalida=bloqueado'; end;
  o := salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Fachada ACM TE', 'motivo_sem_pedido', 'Interno',
    'complexidade', 'Complexa', 'etapas', json_build_array('Corte e dobra ACM', 'Instalação'),
    'equipe', json_build_array(c1, c2))::jsonb);
  out := out || ' complexidade=' || (select complexidade from ordens_producao where id = o);
  select id into e1 from ordens_producao_etapas where ordem_id = o and ordem = 1;
  select id into e2 from ordens_producao_etapas where ordem_id = o and ordem = 2;

  -- Comercial não inicia; Produção inicia (a ordem passa a Em andamento, conta a equipe).
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform iniciar_etapa_producao(e1); out := out || ' comercialInicia=PASSOU';
  exception when others then out := out || ' comercialInicia=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  a1 := iniciar_etapa_producao(e1);
  out := out || ' inicia=ok situacao=' || (select status from ordens_producao where id = o)
    || ' pessoas=' || (select pessoas from ordens_producao_apontamentos where id = a1);
  begin perform iniciar_etapa_producao(e1); out := out || ' iniciaDeNovo=PASSOU';
  exception when others then out := out || ' iniciaDeNovo=bloqueado'; end;

  -- Pausa exige motivo e um trecho aberto.
  begin perform pausar_etapa_producao(e1, '  '); out := out || ' pausaSemMotivo=PASSOU';
  exception when others then out := out || ' pausaSemMotivo=bloqueado'; end;
  perform pausar_etapa_producao(e1, 'Faltou chapa preta fosca');
  out := out || ' pausa=ok';
  begin perform pausar_etapa_producao(e1, 'de novo'); out := out || ' pausaSemAberto=PASSOU';
  exception when others then out := out || ' pausaSemAberto=bloqueado'; end;

  -- Recomeça só com uma pessoa.
  a2 := iniciar_etapa_producao(e1, array[c3]);
  out := out || ' reinicia=' || (select pessoas from ordens_producao_apontamentos where id = a2);

  begin
    insert into ordens_producao_apontamentos (ordem_id, etapa_id, etapa_nome) values (o, e1, 'x');
    out := out || ' escritaDireta=PASSOU';
  exception when others then out := out || ' escritaDireta=bloqueado'; end;

  -- Dar baixa fecha o trecho aberto.
  perform atualizar_etapa_producao(e1, true);
  out := out || ' baixa=ok abertos=' || (select count(*) from ordens_producao_apontamentos where etapa_id = e1 and fim is null)
    || ' fimTipo=' || (select fim_tipo from ordens_producao_apontamentos where id = a2);
  begin perform iniciar_etapa_producao(e1); out := out || ' iniciaConcluida=PASSOU';
  exception when others then out := out || ' iniciaConcluida=bloqueado'; end;

  -- Tudo roda no mesmo instante; recua os inícios: 2 h x 2 pessoas + 1 h x 1 pessoa = 5 h.
  perform set_config('role', 'postgres', true);
  update ordens_producao_apontamentos set inicio = fim - interval '2 hours' where id = a1;
  update ordens_producao_apontamentos set inicio = fim - interval '1 hour' where id = a2;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  out := out || (select ' horas=' || horas || ' trechos=' || trechos || ' amostraComplexidade=' || complexidade
    from amostras_tempo_etapas() where etapa_id = e1);
  out := out || ' membroLe=' || (select count(*) from amostras_tempo_etapas() s where s.ordem_id = o);
  out := out || ' especialidade=' || (select etapa || ':' || horas from horas_colaborador_etapa() where colaborador_id = c1);

  -- Cancelar a ordem fecha o trecho que ficou aberto.
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  perform iniciar_etapa_producao(e2);
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'status', 'Cancelada', 'descricao', 'Fachada ACM TE',
    'complexidade', 'Complexa', 'etapas', json_build_array('Corte e dobra ACM', 'Instalação'),
    'equipe', json_build_array(c1, c2))::jsonb, o);
  out := out || ' cancelaFecha=' || (select count(*) from ordens_producao_apontamentos where ordem_id = o and fim is null)
    || ' motivoCancela=' || (select motivo_pausa from ordens_producao_apontamentos where etapa_id = e2);

  raise exception 'RESULT: %', out;
end $$;
