-- Self-checking test of migration 0043 (assistente do PCP). Run it as one statement: it always
-- ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- semanas=8 semana1=2 porTipo=t atrasadas=1 capacidade=t prazoPedido=t prazoDesejada=t prazoItens=2 libPreenchidos=t semContato=t libOrdens=2 checklists=t comercialBloqueado=blocked momentoRuim=blocked limitePcp=100 limiteComercial=40
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  c uuid; emp uuid; ped uuid; lib uuid; pz uuid; m uuid; ck uuid; seg date; v jsonb; n integer; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-ap@example.com', '{"display_name":"Comercial AP"}'),
    (pc, 'pc-ap@example.com', '{"display_name":"PCP AP"}');
  delete from user_roles where user_id in (co, pc);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp');
  seg := date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date;
  insert into producao_equipes (nome, setor, capacidade_horas_dia) values ('Equipe AP', 'Externa', 16);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  c := salvar_cadastro('{"nome":"Cliente AP"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Produção', 'descricao', 'Fachada AP', 'quantidade', 2),
                              json_build_object('categoria', 'Serviço', 'descricao', 'Instalação AP')))::jsonb);
  pz := solicitar_prazo(ped, ((now() at time zone 'America/Sao_Paulo')::date + 20), 'Cliente quer antes do Natal');
  insert into liberacoes (modelo, cliente, venda_id, contato, endereco, data_entrega)
    values ('projeto', 'Cliente AP', ped, '(31) 99999-0000', 'Rua AP', seg + 3) returning id into lib;

  -- Uma ordem atrasada, feita à mão.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  m := salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Atrasada AP', 'motivo_sem_pedido', 'Interno',
    'data_prevista', seg - 10, 'etapas', json_build_array('a'))::jsonb);

  v := carga_producao();
  out := out || 'semanas=' || jsonb_array_length(v->'semanas')
    || ' semana1=' || (v->'semanas'->0->>'ordens')
    || ' porTipo=' || ((v->'semanas'->0->'por_tipo'->>'Instalação')::int >= 1)
    || ' atrasadas=' || (v->>'atrasadas')
    || ' capacidade=' || ((v->'capacidade_horas_dia_por_setor'->>'Externa')::numeric >= 16);

  v := contexto_assistente_pcp('prazo', pz);
  out := out || ' prazoPedido=' || ((v->'pedido'->>'cliente') = 'Cliente AP')
    || ' prazoDesejada=' || ((v->'pedido_de_prazo'->>'observacao') = 'Cliente quer antes do Natal')
    || ' prazoItens=' || jsonb_array_length(v->'pedido'->'itens');

  v := contexto_assistente_pcp('liberacao', lib);
  out := out || ' libPreenchidos=' || ((v->'liberacao'->'preenchidos'->>'contato')::boolean and not (v->'liberacao'->'preenchidos'->>'projetista')::boolean)
    || ' semContato=' || (position('99999' in v::text) = 0 and position('Rua AP' in v::text) = 0)
    || ' libOrdens=' || jsonb_array_length(v->'ordens')
    || ' checklists=' || (jsonb_typeof(v->'checklists_disponiveis') = 'array');

  begin perform contexto_assistente_pcp('nada', lib); out := out || ' momentoRuim=ALLOWED';
  exception when others then out := out || ' momentoRuim=blocked'; end;

  -- Só Gestão e PCP.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform contexto_assistente_pcp('liberacao', lib); out := out || ' comercialBloqueado=ALLOWED';
  exception when others then out := out || ' comercialBloqueado=blocked'; end;
  -- reorder so the expected string reads naturally
  out := replace(out, ' momentoRuim=blocked comercialBloqueado=blocked', ' comercialBloqueado=blocked momentoRuim=blocked');

  -- Limite diário: 100 para o PCP, 40 para os outros.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  n := 0;
  while registrar_uso_ia() = 'ok' and n < 200 loop n := n + 1; end loop;
  out := out || ' limitePcp=' || n;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  n := 0;
  while registrar_uso_ia() = 'ok' and n < 200 loop n := n + 1; end loop;
  out := out || ' limiteComercial=' || n;

  raise exception 'RESULT: %', out;
end;
$$;
