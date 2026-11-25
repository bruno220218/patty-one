-- Self-checking test of migration 0031 (setores da Produção). Run it as one statement: it always
-- ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- lista=7 pcpCria=ok producaoCria=blocked renomeia=2 excluiEmUso=blocked gestorLiga=ok pcpLiga=blocked producaoLe=1 contaRemovida=0
do $$
declare g uuid := gen_random_uuid(); p uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  s_corte uuid; s_novo uuid; out text := '';
begin
  insert into auth.users (id, email) values (g, 'g-st@example.com'), (p, 'p-st@example.com'),
    (w, 'w-st@example.com');
  insert into user_roles (user_id, role) values
    (g, 'gestor'), (p, 'membro'), (p, 'pcp'), (w, 'membro'), (w, 'producao')
  on conflict do nothing;
  out := 'lista=' || (select count(*) from producao_setores
    where nome in ('Externa', 'Projetos especiais', 'Serralheria', 'Acabamento e montagem',
      'Produção', 'Corte', 'Pintura'));
  select id into s_corte from producao_setores where nome = 'Corte';

  perform set_config('role', 'authenticated', true);
  -- PCP adds a sector; Produção can't.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  begin insert into producao_setores (nome, posicao) values ('Teste ST', 50) returning id into s_novo;
    out := out || ' pcpCria=ok';
  exception when others then out := out || ' pcpCria=BLOCKED'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  begin insert into producao_setores (nome) values ('Outro ST'); out := out || ' producaoCria=ALLOWED';
  exception when insufficient_privilege then out := out || ' producaoCria=blocked'; end;

  -- A team and a programmed service in the new sector follow its rename.
  perform set_config('role', 'postgres', true);
  insert into producao_equipes (nome, setor) values ('Equipe ST', 'Teste ST');
  insert into programacao_servicos (data, data_original, setor, servico)
    values (current_date, current_date, 'Teste ST', 'Serviço ST');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  update producao_setores set nome = 'Teste ST 2' where id = s_novo;
  perform set_config('role', 'postgres', true);
  out := out || ' renomeia=' || ((select count(*) from producao_equipes where setor = 'Teste ST 2')
    + (select count(*) from programacao_servicos where setor = 'Teste ST 2'));
  -- A sector in use can't be deleted.
  perform set_config('role', 'authenticated', true);
  begin delete from producao_setores where id = s_novo; out := out || ' excluiEmUso=ALLOWED';
  exception when foreign_key_violation then out := out || ' excluiEmUso=blocked'; end;

  -- Only gestão puts a person in a sector; everyone approved reads it.
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  begin insert into usuario_setores (user_id, setor_id) values (w, s_corte); out := out || ' gestorLiga=ok';
  exception when others then out := out || ' gestorLiga=BLOCKED'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  begin insert into usuario_setores (user_id, setor_id) values (w, s_novo); out := out || ' pcpLiga=ALLOWED';
  exception when insufficient_privilege then out := out || ' pcpLiga=blocked'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', w, 'role', 'authenticated')::text, true);
  out := out || ' producaoLe=' || (select count(*) from usuario_setores where user_id = w);

  -- Removing the account removes the person's sectors.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from auth.users where id = w;
  out := out || ' contaRemovida=' || (select count(*) from usuario_setores where user_id = w);
  raise exception 'RESULT: %', out;
end $$;
