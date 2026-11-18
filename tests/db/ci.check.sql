-- Self-checking test of the CI de vinheta flow (migration 0013). Run it as one statement:
-- it always ends with an exception "RESULT: ..." so every change is rolled back. Expected:
-- m_cria=blocked semPainel=blocked numeros=1,2 rotulo=01/Nov c_cria=blocked pendentes=3
-- m_aprova=blocked primeiroVago=11 vinhetaCi=01/Nov renova=true mesmoEspaco=true semVaga=blocked
-- recusa=ok editarDepois=blocked excluirDepois=blocked excluirPendente=ok outroMes=1
-- avisoCriacao=1 avisosCriador=3
-- (primeiroVago = lowest free slot of RGB 1 with the imported spreadsheet data.)
do $$
declare
  g uuid := gen_random_uuid(); c uuid := gen_random_uuid(); co uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  p1 uuid; p2 uuid; p4 uuid; ci1 uuid; ci2 uuid; ci3 uuid; cp uuid; n int; pos int; out text := '';
  d jsonb := jsonb_build_object('data', '2026-11-17', 'cliente', 'CSFX', 'titulo', 'CSFX', 'tipo', 'venda',
    'inicio', '2026-11-18', 'fim', '2026-12-18', 'representante_nome', 'Flaviane');
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (g, 'g-ci@example.com', '{"display_name":"Gestão CI"}', 'authenticated', 'authenticated'),
    (c, 'c-ci@example.com', '{"display_name":"Criação CI"}', 'authenticated', 'authenticated'),
    (co, 'co-ci@example.com', '{"display_name":"Comercial CI"}', 'authenticated', 'authenticated'),
    (m, 'm-ci@example.com', '{"display_name":"Membro CI"}', 'authenticated', 'authenticated');
  delete from user_roles where user_id in (c, co, m);
  insert into user_roles (user_id, role) values (g, 'gestor'), (c, 'criacao'), (co, 'comercial'), (m, 'membro')
    on conflict do nothing;
  select id into p1 from paineis where codigo = 'RGB 1';
  select id into p2 from paineis where codigo = 'RGB 2';
  select id into p4 from paineis where codigo = 'RGB 4';
  delete from cis;  -- start numbering from 1 in this test

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  begin perform public.salvar_ci(null, d, array[p1]); out := out || 'm_cria=ALLOWED';
  exception when others then out := out || 'm_cria=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform public.salvar_ci(null, d, '{}'); out := out || ' semPainel=ALLOWED';
  exception when others then out := out || ' semPainel=blocked'; end;
  -- CSFX is already on RGB 2 (renewal there); RGB 4 has no free slot.
  ci1 := public.salvar_ci(null, d, array[p1, p2, p4]);
  ci2 := public.salvar_ci(null, d || '{"cliente":"Outra Loja"}', array[p1]);
  out := out || ' numeros=' || (select string_agg(numero::text, ',' order by numero) from cis)
             || ' rotulo=' || (select public.ci_rotulo(numero, data) from cis where id = ci1);

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin perform public.salvar_ci(null, d, array[p1]); out := out || ' c_cria=ALLOWED';
  exception when others then out := out || ' c_cria=blocked'; end;
  out := out || ' pendentes=' || (select count(*) from ci_paineis where ci_id = ci1 and status = 'pendente');

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  select id into cp from ci_paineis where ci_id = ci1 and painel_id = p1;
  begin perform public.aprovar_ci_painel(cp); out := out || ' m_aprova=ALLOWED';
  exception when others then out := out || ' m_aprova=blocked'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  pos := public.aprovar_ci_painel(cp);
  out := out || ' primeiroVago=' || pos
             || ' vinhetaCi=' || (select ci from painel_vinhetas where painel_id = p1 and posicao = pos and retirada_em is null);

  select id into cp from ci_paineis where ci_id = ci1 and painel_id = p2;
  select posicao into n from painel_vinhetas where painel_id = p2 and cliente = 'CSFX' and retirada_em is null;
  pos := public.aprovar_ci_painel(cp);
  out := out || ' renova=' || (select renovacao from ci_paineis where id = cp)
             || ' mesmoEspaco=' || (pos = n and (select fim from painel_vinhetas where painel_id = p2 and posicao = n and retirada_em is null) = '2026-12-18');

  select id into cp from ci_paineis where ci_id = ci1 and painel_id = p4;
  begin perform public.aprovar_ci_painel(cp); out := out || ' semVaga=ALLOWED';
  exception when others then out := out || ' semVaga=blocked'; end;
  perform public.recusar_ci_painel(cp, 'RGB 4 sem vaga');
  out := out || ' recusa=ok';

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated')::text, true);
  begin perform public.salvar_ci(ci1, d, array[p1]); out := out || ' editarDepois=ALLOWED';
  exception when others then out := out || ' editarDepois=blocked'; end;
  begin perform public.excluir_ci(ci1); out := out || ' excluirDepois=ALLOWED';
  exception when others then out := out || ' excluirDepois=blocked'; end;
  perform public.excluir_ci(ci2);
  out := out || ' excluirPendente=' || case when exists (select 1 from cis where id = ci2) then 'FAIL' else 'ok' end;
  ci3 := public.salvar_ci(null, d || '{"data":"2026-12-01"}', array[p1]);
  out := out || ' outroMes=' || (select numero from cis where id = ci3);
  -- Notices are private (RLS), so count them as the database owner.
  perform set_config('role', 'none', true);
  out := out || ' avisoCriacao=' || (select count(*) from notifications where tipo = 'ci_nova' and recipient_id = c and link = '/cis/' || ci1)
             || ' avisosCriador=' || (select count(*) from notifications where recipient_id = co and tipo in ('ci_vinheta_entrou', 'ci_recusada'));
  raise exception 'RESULT: %', out;
end $$;
