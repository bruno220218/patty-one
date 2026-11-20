-- Self-checking test of migration 0024 (comentários nas liberações, mídias dos painéis, checklist
-- para o PCP). Run it as one statement: it always ends with an exception "RESULT: ..." so every
-- change is rolled back. Expected:
-- comentou=t vazio=blocked direto=blocked avisoCriador=1 avisoPcp=1 avisoAutor=0 avisoAnterior=1 pa01=t linkCriacao=ok linkComercial=blocked linkRuim=blocked pcpVeChecklists=1 pcpCriaProjeto=ok membroVeChecklists=0 membroCriaProjeto=blocked
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  pr uuid := gen_random_uuid(); cr uuid := gen_random_uuid(); mb uuid := gen_random_uuid();
  lib uuid; painel uuid; cl uuid; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-c@example.com', '{"display_name":"Gestão C"}'),
    (co, 'co-c@example.com', '{"display_name":"Comercial C"}'),
    (pc, 'pc-c@example.com', '{"display_name":"PCP C"}'),
    (pr, 'pr-c@example.com', '{"display_name":"Produção C"}'),
    (cr, 'cr-c@example.com', '{"display_name":"Criação C"}'),
    (mb, 'mb-c@example.com', '{"display_name":"Membro C"}');
  delete from user_roles where user_id in (co, pc, pr, cr, mb);
  insert into user_roles (user_id, role) values
    (g, 'gestor'), (co, 'comercial'), (pc, 'pcp'), (pr, 'producao'), (cr, 'criacao'), (mb, 'membro')
    on conflict do nothing;
  perform set_config('role', 'authenticated', true);

  -- 1) Comentários
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  insert into liberacoes (modelo, cliente) values ('midia', 'Cliente C') returning id into lib;

  perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
  perform public.comentar_liberacao(lib, '  Mídia chega amanhã  ');
  out := out || 'comentou=' || exists (select 1 from liberacao_eventos
                                        where liberacao_id = lib and tipo = 'comentario'
                                          and detalhe = 'Mídia chega amanhã' and autor = pr);
  begin perform public.comentar_liberacao(lib, '   '); out := out || ' vazio=ALLOWED';
  exception when others then out := out || ' vazio=blocked'; end;
  begin
    insert into liberacao_eventos (liberacao_id, tipo, detalhe) values (lib, 'comentario', 'x');
    out := out || ' direto=ALLOWED';
  exception when others then out := out || ' direto=blocked'; end;

  -- A second comment (by the creator) must notify the earlier commenter.
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  perform public.comentar_liberacao(lib, 'Combinado');

  perform set_config('role', 'none', true);
  out := out
    || ' avisoCriador=' || (select count(*) from notifications where recipient_id = co and tipo = 'liberacao_comentario')
    || ' avisoPcp=' || (select count(*) from notifications where recipient_id = pc and tipo = 'liberacao_comentario'
                          and detalhe = 'Mídia chega amanhã')
    || ' avisoAutor=' || (select count(*) from notifications where recipient_id = pr and tipo = 'liberacao_comentario'
                            and detalhe = 'Mídia chega amanhã')
    || ' avisoAnterior=' || (select count(*) from notifications where recipient_id = pr and tipo = 'liberacao_comentario'
                               and detalhe = 'Combinado');
  perform set_config('role', 'authenticated', true);

  -- 2) Mídias dos painéis
  out := out || ' pa01=' || ((select midias_link from paineis where codigo = 'PA01') = 'https://us.vnnox.com');
  select id into painel from paineis where codigo = 'RGB 1';
  perform set_config('request.jwt.claims', json_build_object('sub', cr, 'role', 'authenticated')::text, true);
  begin
    perform public.salvar_link_midias_painel(painel, 'https://drive.google.com/drive/folders/abc');
    out := out || ' linkCriacao=' || case when (select midias_link from paineis where id = painel)
                                             = 'https://drive.google.com/drive/folders/abc' then 'ok' else 'NAO_GRAVOU' end;
  exception when others then out := out || ' linkCriacao=ERRO:' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform public.salvar_link_midias_painel(painel, 'https://x.com'); out := out || ' linkComercial=ALLOWED';
  exception when others then out := out || ' linkComercial=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cr, 'role', 'authenticated')::text, true);
  begin perform public.salvar_link_midias_painel(painel, 'drive pasta 1'); out := out || ' linkRuim=ALLOWED';
  exception when others then out := out || ' linkRuim=blocked'; end;

  -- 3) Checklists para o PCP
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  insert into checklists (name) values ('Checklist PCP') returning id into cl;
  insert into checklist_tasks (checklist_id, title, position) values (cl, 'Conferir', 1);
  out := out || ' pcpVeChecklists=' || (select count(*) from checklists where id = cl);
  begin perform public.create_project('Projeto PCP', '', null, cl); out := out || ' pcpCriaProjeto=ok';
  exception when others then out := out || ' pcpCriaProjeto=ERRO:' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  out := out || ' membroVeChecklists=' || (select count(*) from checklists where id = cl);
  begin perform public.create_project('Projeto membro', '', null, cl); out := out || ' membroCriaProjeto=ALLOWED';
  exception when others then out := out || ' membroCriaProjeto=blocked'; end;

  raise exception 'RESULT: %', out;
end $$;
