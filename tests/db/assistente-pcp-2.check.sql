-- Self-checking test of migration 0044 (assistente do PCP, 2ª leva). Run it as one statement: it
-- always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- ordemEtapas=2 emAndamento=t pausa=t historico=t programacaoOrdem=1 eventos=t servicos=2 pessoaDupla=Ana AP2 veiculoDuplo=t semProgramacao=t semBaixa=1 comercialOrdem=blocked comercialDia=blocked prazoSegue=t
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  c uuid; ana uuid; beto uuid; vei uuid; o uuid; o2 uuid; o3 uuid; e1 uuid; e2 uuid; ped uuid; pz uuid; emp uuid;
  d date := (now() at time zone 'America/Sao_Paulo')::date; v jsonb; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-a2@example.com', '{"display_name":"Comercial A2"}'),
    (pc, 'pc-a2@example.com', '{"display_name":"PCP A2"}');
  delete from user_roles where user_id in (co, pc);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp');
  insert into producao_colaboradores (nome) values ('Ana AP2') returning id into ana;
  insert into producao_colaboradores (nome) values ('Beto AP2') returning id into beto;
  insert into producao_veiculos (placa, apelido) values ('AAP2A22', 'Strada AP2') returning id into vei;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  -- Uma ordem antiga concluída com tempo na etapa "Corte" (histórico) e uma em andamento.
  o2 := salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Antiga AP2', 'motivo_sem_pedido', 'Interno',
    'etapas', json_build_array('Corte'))::jsonb);
  select id into e1 from ordens_producao_etapas where ordem_id = o2;
  perform iniciar_etapa_producao(e1, array[ana]);
  perform atualizar_etapa_producao(e1, true);
  o := salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Atual AP2', 'motivo_sem_pedido', 'Interno',
    'data_prevista', d + 2, 'etapas', json_build_array('Corte', 'Acabamento'))::jsonb);
  select id into e1 from ordens_producao_etapas where ordem_id = o and ordem = 1;
  select id into e2 from ordens_producao_etapas where ordem_id = o and ordem = 2;
  perform iniciar_etapa_producao(e1, array[ana]);
  perform pausar_etapa_producao(e1, 'Falta lona');
  perform iniciar_etapa_producao(e1, array[ana]);
  o3 := salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Sem programação AP2', 'motivo_sem_pedido', 'Interno',
    'data_prevista', d + 1, 'etapas', json_build_array('a'))::jsonb);

  -- Programação do dia: Ana em dois serviços, o mesmo veículo nos dois; um serviço de ontem sem baixa.
  perform set_config('role', 'none', true);
  insert into programacao_servicos (data, data_original, setor, cliente, servico, lider_id, veiculo_id, ordem_id, posicao)
    values (d, d, 'Externa', 'Cliente AP2', 'Instalação', ana, vei, o, 1),
           (d, d, 'Externa', 'Cliente AP2b', 'Colagem', beto, vei, null, 2),
           (d - 1, d - 1, 'Externa', 'Cliente AP2c', 'Ontem', beto, null, null, 1);
  insert into programacao_servicos_ajudantes (servico_id, colaborador_id)
    select id, ana from programacao_servicos where data = d and lider_id = beto;
  perform set_config('role', 'authenticated', true);

  v := contexto_assistente_pcp('ordem', o);
  out := out || 'ordemEtapas=' || jsonb_array_length(v->'etapas')
    || ' emAndamento=' || (v->'etapas'->0->>'em_andamento')::boolean
    || ' pausa=' || ((v->'etapas'->0->>'ultima_pausa') = 'Falta lona')
    || ' historico=' || (v->'etapas'->0 ? 'mediana_horas_historico')
    || ' programacaoOrdem=' || jsonb_array_length(v->'programacao')
    || ' eventos=' || (jsonb_array_length(v->'eventos_recentes') > 0);

  v := contexto_programacao_pcp(d);
  out := out || ' servicos=' || jsonb_array_length(v->'servicos')
    || ' pessoaDupla=' || coalesce((select string_agg(x->>'nome', ',') from jsonb_array_elements(v->'pessoas_em_mais_de_um') x), '-')
    || ' veiculoDuplo=' || ((v->'veiculos_em_mais_de_um'->0->>'servicos')::int = 2)
    || ' semProgramacao=' || exists (select 1 from jsonb_array_elements(v->'ordens_sem_programacao') x
                                     where (x->>'descricao') = 'Sem programação AP2')
    || ' semBaixa=' || (v->'pendencias'->>'sem_baixa');

  -- Só Gestão e PCP; os momentos da 0043 continuam.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform contexto_assistente_pcp('ordem', o); out := out || ' comercialOrdem=ALLOWED';
  exception when others then out := out || ' comercialOrdem=blocked'; end;
  begin perform contexto_programacao_pcp(d); out := out || ' comercialDia=ALLOWED';
  exception when others then out := out || ' comercialDia=blocked'; end;
  c := salvar_cadastro('{"nome":"Cliente A2"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Item A2')))::jsonb);
  pz := solicitar_prazo(ped, null, '');
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  out := out || ' prazoSegue=' || ((contexto_assistente_pcp('prazo', pz)->>'momento') = 'prazo');

  raise exception 'RESULT: %', out;
end;
$$;
