-- Self-checking test of migration 0036 (ordens automáticas da liberação e ordem sem pedido). Run it
-- as one statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- ordens=2 situacao=Aguardando liberação tipos=Impressão,Instalação etapas=8 local=t prazo=t itens=t evento=t iniciaAntes=blocked baixaAntes=blocked pcpEdita=ok pedidoFixo=t aprovada=Aguardando iniciaDepois=ok semMotivo=blocked comMotivo=Garantia escolheEspera=Aguardando voltaEspera=blocked urgenciaLiga=t tirarSemMotivo=blocked trocaPedido=1/t excluida=0 antigaEdita=ok comercialSalva=blocked
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  c uuid; emp uuid; ped uuid; ped2 uuid; ped3 uuid; lib uuid; lib2 uuid;
  o uuid; e uuid; m uuid; u uuid; antiga uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-ol@example.com', '{"display_name":"Comercial OL"}'),
    (pc, 'pc-ol@example.com', '{"display_name":"PCP OL"}');
  delete from user_roles where user_id in (co, pc);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);

  c := salvar_cadastro('{"nome":"Cliente OL"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('categoria', 'Produção', 'descricao', 'Fachada ACM', 'quantidade', 2),
      json_build_object('categoria', 'Mídia OOH', 'descricao', 'Outdoor', 'ponto', 'P-10',
        'periodo_inicio', '2026-12-01', 'periodo_fim', '2026-12-14')))::jsonb);
  ped2 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'Placa A'),
                              json_build_object('categoria', 'Serviço', 'descricao', 'Placa B')))::jsonb);
  ped3 := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(json_build_object('categoria', 'Serviço', 'descricao', 'Placa C')))::jsonb);

  -- O comercial cria a liberação do pedido: nasce uma ordem por item, esperando a aprovação.
  insert into liberacoes (modelo, cliente, venda_id, endereco, data_entrega)
    values ('projeto', 'Cliente OL', ped, 'Rua A, 10', '2026-12-20') returning id into lib;
  out := out || 'ordens=' || (select count(*) from ordens_producao where liberacao_id = lib)
    || ' situacao=' || (select string_agg(distinct status, ',') from ordens_producao where liberacao_id = lib)
    || ' tipos=' || (select string_agg(tipo, ',' order by tipo) from ordens_producao where liberacao_id = lib)
    || ' etapas=' || (select count(*) from ordens_producao_etapas e join ordens_producao o2 on o2.id = e.ordem_id where o2.liberacao_id = lib)
    || ' local=' || ((select local_instalacao from ordens_producao where liberacao_id = lib and tipo = 'Instalação') = 'Rua A, 10')
    || ' prazo=' || (select bool_and(data_prevista = '2026-12-20' and venda_id = ped and cadastro_id = c) from ordens_producao where liberacao_id = lib)
    || ' itens=' || ((select count(distinct venda_item_id) from ordens_producao where liberacao_id = lib) = 2
                    and exists (select 1 from ordens_producao where liberacao_id = lib and descricao = 'Outdoor — P-10'
                                and observacao = 'Quantidade: 1 · Período: 01/12/2026 a 14/12/2026'))
    || ' evento=' || exists (select 1 from ordens_producao_eventos ev join ordens_producao o2 on o2.id = ev.ordem_id
                             where o2.liberacao_id = lib and ev.descricao like 'Ordem criada pela liberação nº%');
  select id into o from ordens_producao where liberacao_id = lib and tipo = 'Instalação';
  select id into e from ordens_producao_etapas where ordem_id = o and ordem = 1;

  -- Antes da aprovação, ninguém executa.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin perform iniciar_etapa_producao(e); out := out || ' iniciaAntes=ALLOWED';
  exception when others then out := out || ' iniciaAntes=blocked'; end;
  begin perform atualizar_etapa_producao(e, true); out := out || ' baixaAntes=ALLOWED';
  exception when others then out := out || ' baixaAntes=blocked'; end;

  -- O PCP ajusta a ordem (continua esperando); o pedido da ordem não muda por aqui.
  begin
    perform salvar_ordem_producao(json_build_object('tipo', 'Instalação', 'status', 'Aguardando liberação',
      'descricao', 'Fachada ACM', 'local_instalacao', 'Rua A, 10', 'venda_id', '', 'cadastro_id', c,
      'etapas', json_build_array('Preparação'))::jsonb, o);
    out := out || ' pcpEdita=ok';
  exception when others then out := out || ' pcpEdita=ERRO:' || sqlerrm; end;
  out := out || ' pedidoFixo=' || (select venda_id = ped and status = 'Aguardando liberação' from ordens_producao where id = o);

  -- Aprovada a liberação, as ordens entram na produção.
  update liberacoes set status = 'aprovada' where id = lib;
  out := out || ' aprovada=' || (select string_agg(distinct status, ',') from ordens_producao where liberacao_id = lib);
  begin perform iniciar_etapa_producao(e); out := out || ' iniciaDepois=ok';
  exception when others then out := out || ' iniciaDepois=ERRO:' || sqlerrm; end;

  -- Ordem à mão sem pedido: motivo obrigatório.
  begin perform salvar_ordem_producao('{"tipo":"Impressão","descricao":"Sem motivo","etapas":["a"]}'::jsonb);
    out := out || ' semMotivo=ALLOWED';
  exception when others then out := out || ' semMotivo=blocked'; end;
  m := salvar_ordem_producao('{"tipo":"Impressão","descricao":"Garantia","motivo_sem_pedido":"Garantia","status":"Aguardando liberação","etapas":["a"]}'::jsonb);
  out := out || ' comMotivo=' || (select motivo_sem_pedido from ordens_producao where id = m)
             || ' escolheEspera=' || (select status from ordens_producao where id = m);
  begin
    perform salvar_ordem_producao('{"tipo":"Impressão","descricao":"Garantia","motivo_sem_pedido":"Garantia","status":"Aguardando liberação","etapas":["a"]}'::jsonb, m);
    out := out || ' voltaEspera=ALLOWED';
  exception when others then out := out || ' voltaEspera=blocked'; end;

  -- Urgência: o pedido entra depois (o motivo sai); tirar o pedido exige o motivo.
  u := salvar_ordem_producao('{"tipo":"Impressão","descricao":"Urgente","motivo_sem_pedido":"Urgência","etapas":["a"]}'::jsonb);
  perform salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Urgente', 'venda_id', ped3,
    'motivo_sem_pedido', 'Urgência', 'etapas', json_build_array('a'))::jsonb, u);
  out := out || ' urgenciaLiga=' || (select venda_id = ped3 and motivo_sem_pedido = '' from ordens_producao where id = u);
  begin
    perform salvar_ordem_producao('{"tipo":"Impressão","descricao":"Urgente","etapas":["a"]}'::jsonb, u);
    out := out || ' tirarSemMotivo=ALLOWED';
  exception when others then out := out || ' tirarSemMotivo=blocked'; end;

  -- Trocar o pedido da liberação refaz as ordens; excluir a liberação apaga as que esperavam.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  insert into liberacoes (modelo, cliente, venda_id) values ('projeto', 'Cliente OL', ped2) returning id into lib2;
  update liberacoes set venda_id = ped3 where id = lib2;
  out := out || ' trocaPedido=' || (select count(*) from ordens_producao where liberacao_id = lib2)
    || '/' || (select bool_and(venda_id = ped3 and tipo = 'Impressão') from ordens_producao where liberacao_id = lib2);
  delete from liberacoes where id = lib2;
  out := out || ' excluida=' || (select count(*) from ordens_producao where venda_id in (ped2, ped3) and venda_item_id is not null);

  -- Ordem antiga (sem pedido e sem motivo) continua editável.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform set_config('role', 'none', true);
  insert into ordens_producao (tipo, descricao) values ('Impressão', 'Antiga') returning id into antiga;
  perform set_config('role', 'authenticated', true);
  begin
    perform salvar_ordem_producao('{"tipo":"Impressão","descricao":"Antiga editada","etapas":["a"]}'::jsonb, antiga);
    out := out || ' antigaEdita=ok';
  exception when others then out := out || ' antigaEdita=ERRO:' || sqlerrm; end;

  -- O comercial não edita ordens.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform salvar_ordem_producao('{"tipo":"Impressão","descricao":"x","motivo_sem_pedido":"Interno","etapas":["a"]}'::jsonb);
    out := out || ' comercialSalva=ALLOWED';
  exception when others then out := out || ' comercialSalva=blocked'; end;

  raise exception 'RESULT: %', out;
end;
$$;
