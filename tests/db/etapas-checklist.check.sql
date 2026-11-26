-- Self-checking test of migration 0039 (etapas da ordem a partir do checklist). Run it as one
-- statement: it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- comercialPadrao=blocked vazioPadrao=blocked padrao=ok etapas=Medir,Montar,Instalar checklist=t fixas=t
-- impressaoPadrao=4 comercialTroca=blocked troca=2/f volta=3/t servicoNaoRefaz=3 trigger=blocked
-- aprovada=Aguardando comecou=blocked autor=Produção EC reabreProducao=blocked reabreGestao=ok
-- manual=2/Pintar padraoTipo=4 exclui=0
do $$
declare
  co uuid := gen_random_uuid(); pc uuid := gen_random_uuid(); pr uuid := gen_random_uuid(); g uuid := gen_random_uuid();
  cl_fixo uuid; cl_livre uuid; cl_vazio uuid; c uuid; emp uuid; ped uuid; lib uuid; o uuid; o2 uuid; e uuid; s uuid;
  out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (co, 'co-ec@example.com', '{"display_name":"Comercial EC"}'), (pc, 'pc-ec@example.com', '{"display_name":"PCP EC"}'),
    (pr, 'pr-ec@example.com', '{"display_name":"Produção EC"}'), (g, 'g-ec@example.com', '{"display_name":"Gestão EC"}');
  delete from user_roles where user_id in (co, pc, pr, g);
  insert into user_roles (user_id, role) values (co, 'comercial'), (pc, 'pcp'), (pr, 'producao'), (g, 'gestor');
  update profiles set display_name = 'Produção EC' where id = pr;
  perform set_config('role', 'authenticated', true);

  -- O PCP tem dois checklists (um com parâmetros fixos) e um vazio.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  insert into checklists (name, fixed_params) values ('Fachada EC', true) returning id into cl_fixo;
  insert into checklist_tasks (checklist_id, title, position) values (cl_fixo, 'Medir', 1), (cl_fixo, 'Montar', 2), (cl_fixo, 'Instalar', 3);
  insert into checklists (name) values ('Rápido EC') returning id into cl_livre;
  insert into checklist_tasks (checklist_id, title, position) values (cl_livre, 'Pintar', 1), (cl_livre, 'Entregar', 2);
  insert into checklists (name) values ('Vazio EC') returning id into cl_vazio;
  insert into producao_servicos (id_sige, nome, etapas) values (987654, 'Serviço EC', '["X","Y"]') returning id into s;

  -- Checklist padrão: só gestão/PCP; precisa de tarefas.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform definir_checklist_padrao('Instalação', cl_fixo); out := out || 'comercialPadrao=ALLOWED';
  exception when others then out := out || 'comercialPadrao=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin perform definir_checklist_padrao('Instalação', cl_vazio); out := out || ' vazioPadrao=ALLOWED';
  exception when others then out := out || ' vazioPadrao=blocked'; end;
  perform definir_checklist_padrao('Instalação', cl_fixo);
  out := out || ' padrao=ok';

  -- A liberação do pedido gera a ordem com as etapas do checklist padrão do tipo.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  c := salvar_cadastro('{"nome":"Cliente EC"}'::jsonb);
  select id into emp from empresas where nome = 'Patty Painéis';
  ped := salvar_venda(json_build_object('tipo', 'pedido', 'empresa_id', emp, 'cadastro_id', c, 'status', 'Aberto',
    'itens', json_build_array(
      json_build_object('categoria', 'Produção', 'descricao', 'Fachada EC'),
      json_build_object('categoria', 'Mídia OOH', 'descricao', 'Outdoor EC', 'ponto', 'P-1')))::jsonb);
  insert into liberacoes (modelo, cliente, venda_id, endereco, data_entrega)
    values ('projeto', 'Cliente EC', ped, 'Rua EC, 1', '2026-12-20') returning id into lib;
  select id into o from ordens_producao where liberacao_id = lib and tipo = 'Instalação';
  out := out || ' etapas=' || (select string_agg(nome, ',' order by ordem) from ordens_producao_etapas where ordem_id = o)
    || ' checklist=' || (select checklist_id = cl_fixo from ordens_producao where id = o)
    || ' fixas=' || (select etapas_fixas from ordens_producao where id = o)
    || ' impressaoPadrao=' || (select count(*) from ordens_producao_etapas e2 join ordens_producao o3 on o3.id = e2.ordem_id
                               where o3.liberacao_id = lib and o3.tipo = 'Colagem');  -- Mídia OOH vira Colagem desde a 0042

  -- Trocar o checklist antes de começar: só gestão/PCP.
  begin perform trocar_checklist_ordem(o, cl_livre); out := out || ' comercialTroca=ALLOWED';
  exception when others then out := out || ' comercialTroca=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  perform trocar_checklist_ordem(o, cl_livre);
  out := out || ' troca=' || (select count(*) from ordens_producao_etapas where ordem_id = o)
    || '/' || (select etapas_fixas from ordens_producao where id = o);
  perform trocar_checklist_ordem(o, cl_fixo);
  out := out || ' volta=' || (select count(*) from ordens_producao_etapas where ordem_id = o)
    || '/' || (select etapas_fixas from ordens_producao where id = o);

  -- Com checklist, trocar o serviço não refaz as etapas.
  perform salvar_ordem_producao(json_build_object('tipo', 'Instalação', 'status', 'Aguardando liberação',
    'descricao', 'Fachada EC', 'local_instalacao', 'Rua EC, 1', 'cadastro_id', c, 'servico_id', s,
    'etapas', json_build_array('X', 'Y'))::jsonb, o);
  out := out || ' servicoNaoRefaz=' || (select count(*) from ordens_producao_etapas where ordem_id = o);

  -- Parâmetros fixos: nem por fora das funções as etapas mudam.
  perform set_config('role', 'postgres', true);
  begin
    insert into ordens_producao_etapas (ordem_id, ordem, nome) values (o, 9, 'Extra');
    out := out || ' trigger=ALLOWED';
  exception when others then out := out || ' trigger=blocked'; end;
  perform set_config('role', 'authenticated', true);

  -- Aprovada e começada, a troca não é mais possível.
  update liberacoes set status = 'aprovada' where id = lib;
  out := out || ' aprovada=' || (select status from ordens_producao where id = o);
  select id into e from ordens_producao_etapas where ordem_id = o and ordem = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  perform atualizar_etapa_producao(e, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  begin perform trocar_checklist_ordem(o, cl_livre); out := out || ' comecou=ALLOWED';
  exception when others then out := out || ' comecou=blocked'; end;

  -- Quem concluiu fica gravado; só a gestão reabre.
  out := out || ' autor=' || (select concluido_por_nome from ordens_producao_etapas where id = e);
  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  begin perform atualizar_etapa_producao(e, false); out := out || ' reabreProducao=ALLOWED';
  exception when others then out := out || ' reabreProducao=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform atualizar_etapa_producao(e, false);
  out := out || ' reabreGestao=' || (select case when not concluido then 'ok' else 'falhou' end from ordens_producao_etapas where id = e);

  -- Ordem aberta à mão com checklist: as etapas vêm do checklist, não do app.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  o2 := salvar_ordem_producao(json_build_object('tipo', 'Impressão', 'descricao', 'Interna EC',
    'motivo_sem_pedido', 'Interno', 'checklist_id', cl_livre, 'etapas', json_build_array())::jsonb);
  out := out || ' manual=' || (select count(*) from ordens_producao_etapas where ordem_id = o2)
    || '/' || (select nome from ordens_producao_etapas where ordem_id = o2 and ordem = 1);
  -- Sem checklist ("padrão"), volta às etapas padrão do tipo (a ordem não tem serviço).
  perform trocar_checklist_ordem(o2, null);
  out := out || ' padraoTipo=' || (select count(*) from ordens_producao_etapas where ordem_id = o2);

  -- Excluir uma ordem travada leva as etapas junto.
  delete from ordens_producao where id = o;
  out := out || ' exclui=' || (select count(*) from ordens_producao_etapas where ordem_id = o);

  raise exception 'RESULT: %', out;
end $$;
