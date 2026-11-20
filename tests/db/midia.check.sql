-- Self-checking test of migration 0022 (mídia OOH). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- calendario2019a2027=235 b46=2026-11-02 virada2027=2026-12-28 membroVe=true membroCria=bloqueado
-- pcpCria=ok codigoVazio=null colunaSige=bloqueado pcpMarca=bloqueado comercialReserva=Reservado
-- ocupa=Ocupado clienteMantido=Loja X foraCalendario=bloqueado livre=0 escritaDireta=bloqueado
-- foto=ok pcpExclui=0 gestaoExclui=1 fotoLimpa=0 ocupacaoLimpa=0
do $$
declare
  g uuid := gen_random_uuid(); co uuid := gen_random_uuid(); pc uuid := gen_random_uuid();
  me uuid := gen_random_uuid(); t uuid; p uuid; p2 uuid; n int; out text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (g, 'g-mid@example.com', '{"display_name":"Gestão Mid"}'),
    (co, 'co-mid@example.com', '{"display_name":"Comercial Mid"}'),
    (pc, 'pc-mid@example.com', '{"display_name":"PCP Mid"}'),
    (me, 'me-mid@example.com', '{"display_name":"Membro Mid"}');
  delete from user_roles where user_id in (g, co, pc, me);
  insert into user_roles (user_id, role) values (g, 'gestor'), (co, 'comercial'), (pc, 'pcp'), (me, 'membro');
  perform set_config('role', 'authenticated', true);

  -- Calendário oficial gerado pela migração.
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  out := out || 'calendario2019a2027=' || (select count(*) from calendario_bissemanas where ano between 2019 and 2027);
  out := out || ' b46=' || (select inicio from calendario_bissemanas where ano = 2026 and codigo_sige = 46);
  out := out || ' virada2027=' || (select inicio from calendario_bissemanas where ano = 2027 and numero = 1);
  select id into t from tipos_midia where nome = 'Outdoor';
  out := out || ' membroVe=' || (t is not null);
  begin
    insert into pontos_midia (nome, tipo_id) values ('Ponto membro', t);
    out := out || ' membroCria=PASSOU';
  exception when others then out := out || ' membroCria=bloqueado'; end;

  -- PCP cadastra; código vazio vira nulo; colunas do SIGE não entram pelo app.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  insert into pontos_midia (codigo, nome, tipo_id, latitude, longitude) values ('', 'Outdoor Teste', t, -19.9, -43.9)
    returning id into p;
  insert into pontos_midia (codigo, nome, tipo_id) values ('  ', 'Outdoor Teste 2', t) returning id into p2;
  out := out || ' pcpCria=ok codigoVazio=' || coalesce((select codigo from pontos_midia where id = p), 'null');
  begin
    update pontos_midia set id_sige = '123' where id = p;
    out := out || ' colunaSige=PASSOU';
  exception when others then out := out || ' colunaSige=bloqueado'; end;

  -- Ocupação: PCP não marca; comercial reserva e ocupa; cliente fica; fora do calendário não.
  begin
    perform marcar_ocupacao(p, 2026, 23, 'Reservado', 'Loja X');
    out := out || ' pcpMarca=PASSOU';
  exception when others then out := out || ' pcpMarca=bloqueado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  out := out || ' comercialReserva=' || marcar_ocupacao(p, 2026, 23, 'Reservado', 'Loja X');
  out := out || ' ocupa=' || marcar_ocupacao(p, 2026, 23, 'Ocupado', null);
  out := out || ' clienteMantido=' || (select cliente from pontos_ocupacao where ponto_id = p and ano = 2026 and bissemana = 23);
  begin
    perform marcar_ocupacao(p, 2026, 27, 'Reservado', null);
    out := out || ' foraCalendario=PASSOU';
  exception when others then out := out || ' foraCalendario=bloqueado'; end;
  perform marcar_ocupacao(p2, 2026, 1, 'Reservado', null);
  perform marcar_ocupacao(p2, 2026, 1, 'Livre', null);
  out := out || ' livre=' || (select count(*) from pontos_ocupacao where ponto_id = p2);
  begin
    insert into pontos_ocupacao (ponto_id, ano, bissemana, status) values (p2, 2026, 2, 'Ocupado');
    out := out || ' escritaDireta=PASSOU';
  exception when others then out := out || ' escritaDireta=bloqueado'; end;

  -- Foto (anexo no Drive) do ponto.
  insert into anexos (entidade, entidade_id, url, nome, tipo) values ('ponto_midia', p, 'https://drive.google.com/x', 'foto.jpg', 'foto');
  out := out || ' foto=ok';

  -- Só a gestão exclui; ocupação e fotos saem junto.
  perform set_config('request.jwt.claims', json_build_object('sub', pc, 'role', 'authenticated')::text, true);
  with x as (delete from pontos_midia where id = p returning 1) select count(*) into n from x;
  out := out || ' pcpExclui=' || n;
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  with x as (delete from pontos_midia where id = p returning 1) select count(*) into n from x;
  out := out || ' gestaoExclui=' || n;
  out := out || ' fotoLimpa=' || (select count(*) from anexos where entidade = 'ponto_midia' and entidade_id = p);
  out := out || ' ocupacaoLimpa=' || (select count(*) from pontos_ocupacao where ponto_id = p);

  raise exception 'RESULT: %', out;
end;
$$;
