-- Tempo das etapas das ordens de produção (adaptativo).
--
-- Quem executa toca "Iniciar" ao começar uma etapa, "Pausar" (com o motivo) quando para e dá
-- baixa (concluir) quando termina. Cada trecho trabalhado vira um apontamento com início, fim e
-- o número de pessoas; as horas gastas da etapa são a soma de (fim - início) x pessoas.
-- As etapas concluídas viram amostras: a estimativa de uma etapa nova sai da mediana das
-- amostras mais recentes do mesmo serviço, da mesma etapa e do mesmo nível de complexidade
-- (Simples / Média / Complexa, marcado pelo PCP na ordem). Esse cálculo fica no app
-- (`producao-rules.ts`); o banco guarda os apontamentos e entrega as amostras.
--
-- Escritas só pelas funções abaixo (security definer), com as permissões de sempre:
-- Gestão, PCP, Produção e Montagem executam (`can_executar_operacao`).

-- ---------- 1) Complexidade da ordem ----------
alter table public.ordens_producao
  add column if not exists complexidade text not null default 'Média';
alter table public.ordens_producao drop constraint if exists ordens_producao_complexidade_check;
alter table public.ordens_producao add constraint ordens_producao_complexidade_check
  check (complexidade in ('Simples', 'Média', 'Complexa'));

-- ---------- 2) Apontamentos ----------
-- etapa_id fica nulo se as etapas forem trocadas; o nome e a ordem ficam guardados.
create table if not exists public.ordens_producao_apontamentos (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_producao (id) on delete cascade,
  etapa_id uuid references public.ordens_producao_etapas (id) on delete set null,
  etapa_nome text not null,
  inicio timestamptz not null default now(),
  fim timestamptz,
  fim_tipo text check (fim_tipo in ('pausa', 'conclusao')),
  motivo_pausa text not null default '',
  pessoas integer not null default 1 check (pessoas between 1 and 50),
  iniciado_por uuid references auth.users (id) on delete set null,
  iniciado_por_nome text not null default '',
  encerrado_por uuid references auth.users (id) on delete set null,
  encerrado_por_nome text not null default '',
  check ((fim is null) = (fim_tipo is null)),
  check (fim is null or fim >= inicio)
);
create index if not exists apontamentos_ordem_idx on public.ordens_producao_apontamentos (ordem_id, inicio);
create index if not exists apontamentos_etapa_idx on public.ordens_producao_apontamentos (etapa_id);
-- Um trecho aberto por etapa.
create unique index if not exists apontamentos_um_aberto
  on public.ordens_producao_apontamentos (etapa_id) where fim is null;

create table if not exists public.ordens_producao_apontamento_colaboradores (
  apontamento_id uuid not null references public.ordens_producao_apontamentos (id) on delete cascade,
  colaborador_id uuid not null references public.producao_colaboradores (id) on delete restrict,
  primary key (apontamento_id, colaborador_id)
);

do $$
declare t text;
begin
  foreach t in array array['ordens_producao_apontamentos', 'ordens_producao_apontamento_colaboradores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists equipe_le on public.%I', t);
    execute format('create policy equipe_le on public.%I for select to authenticated using (public.is_team_member(auth.uid()))', t);
  end loop;
end $$;

-- Fecha o trecho aberto de uma etapa (se houver). Uso interno.
create or replace function public.fechar_apontamento_etapa(p_etapa uuid, p_tipo text, p_motivo text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.ordens_producao_apontamentos set
    fim = greatest(now(), inicio),
    fim_tipo = p_tipo,
    motivo_pausa = coalesce(btrim(p_motivo), ''),
    encerrado_por = auth.uid(),
    encerrado_por_nome = public.current_display_name()
  where etapa_id = p_etapa and fim is null;
  return found;
end;
$$;
revoke all on function public.fechar_apontamento_etapa(uuid, text, text) from public, anon, authenticated;

-- ---------- 3) Iniciar e pausar ----------
-- Sem colaboradores informados, conta a equipe da ordem (mínimo 1 pessoa).
create or replace function public.iniciar_etapa_producao(etapa_uuid uuid, colaboradores uuid[] default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ordem uuid;
  v_nome text;
  v_concluido boolean;
  v_status text;
  v_cols uuid[];
  v_id uuid;
begin
  if not public.can_executar_operacao(auth.uid()) then
    raise exception 'Só Gestão, PCP, Produção e Montagem iniciam etapas' using errcode = '42501';
  end if;
  select e.ordem_id, e.nome, e.concluido, o.status into v_ordem, v_nome, v_concluido, v_status
  from public.ordens_producao_etapas e join public.ordens_producao o on o.id = e.ordem_id
  where e.id = etapa_uuid for update of e, o;
  if not found then raise exception 'Etapa não encontrada'; end if;
  if v_status in ('Concluída', 'Cancelada') then raise exception 'Reabra a ordem antes de iniciar etapas'; end if;
  if v_concluido then raise exception 'Esta etapa já foi concluída'; end if;
  if exists (select 1 from public.ordens_producao_apontamentos where etapa_id = etapa_uuid and fim is null) then
    raise exception 'Esta etapa já está em andamento';
  end if;

  if colaboradores is null or cardinality(colaboradores) = 0 then
    select coalesce(array_agg(colaborador_id), '{}') into v_cols
    from public.ordens_producao_equipe where ordem_id = v_ordem;
  else
    select coalesce(array_agg(distinct c), '{}') into v_cols from unnest(colaboradores) c;
    if exists (
      select 1 from unnest(v_cols) c
      where not exists (select 1 from public.producao_colaboradores p where p.id = c)
    ) then
      raise exception 'Colaborador não encontrado';
    end if;
  end if;

  insert into public.ordens_producao_apontamentos
    (ordem_id, etapa_id, etapa_nome, pessoas, iniciado_por, iniciado_por_nome)
  values
    (v_ordem, etapa_uuid, v_nome, greatest(1, cardinality(v_cols)), auth.uid(), public.current_display_name())
  returning id into v_id;
  insert into public.ordens_producao_apontamento_colaboradores (apontamento_id, colaborador_id)
  select v_id, c from unnest(v_cols) c;

  if v_status = 'Aguardando' then
    update public.ordens_producao set status = 'Em andamento', data_inicio = coalesce(data_inicio, now())
    where id = v_ordem;
    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    values (v_ordem, 'status', 'Situação alterada de Aguardando para Em andamento');
  end if;
  insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
  values (v_ordem, 'etapa', format('Etapa iniciada: %s (%s %s)', v_nome, greatest(1, cardinality(v_cols)),
    case when cardinality(v_cols) > 1 then 'pessoas' else 'pessoa' end));
  return v_id;
end;
$$;
revoke all on function public.iniciar_etapa_producao(uuid, uuid[]) from public, anon;
grant execute on function public.iniciar_etapa_producao(uuid, uuid[]) to authenticated;

create or replace function public.pausar_etapa_producao(etapa_uuid uuid, motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ordem uuid;
  v_nome text;
begin
  if not public.can_executar_operacao(auth.uid()) then
    raise exception 'Só Gestão, PCP, Produção e Montagem pausam etapas' using errcode = '42501';
  end if;
  if btrim(coalesce(motivo, '')) = '' then raise exception 'Informe o motivo da pausa'; end if;
  select ordem_id, nome into v_ordem, v_nome from public.ordens_producao_etapas where id = etapa_uuid;
  if not found then raise exception 'Etapa não encontrada'; end if;
  if not public.fechar_apontamento_etapa(etapa_uuid, 'pausa', motivo) then
    raise exception 'Esta etapa não está em andamento';
  end if;
  insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
  values (v_ordem, 'etapa', format('Etapa pausada: %s — %s', v_nome, btrim(motivo)));
end;
$$;
revoke all on function public.pausar_etapa_producao(uuid, text) from public, anon;
grant execute on function public.pausar_etapa_producao(uuid, text) to authenticated;

-- ---------- 4) Dar baixa (concluir) fecha o trecho aberto ----------
create or replace function public.atualizar_etapa_producao(etapa_uuid uuid, concluida boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ordem uuid;
  v_nome text;
  v_status text;
begin
  if not public.can_executar_operacao(auth.uid()) then
    raise exception 'Só Gestão, PCP, Produção e Montagem marcam etapas' using errcode = '42501';
  end if;
  select e.ordem_id, e.nome, o.status into v_ordem, v_nome, v_status
  from public.ordens_producao_etapas e join public.ordens_producao o on o.id = e.ordem_id
  where e.id = etapa_uuid for update of e;
  if not found then raise exception 'Etapa não encontrada'; end if;
  if v_status in ('Concluída', 'Cancelada') then raise exception 'Reabra a ordem antes de alterar as etapas'; end if;
  if concluida then
    perform public.fechar_apontamento_etapa(etapa_uuid, 'conclusao', '');
  end if;
  update public.ordens_producao_etapas set
    concluido = concluida,
    concluido_em = case when concluida then now() else null end,
    concluido_por = case when concluida then auth.uid() else null end,
    concluido_por_nome = case when concluida then public.current_display_name() else '' end
  where id = etapa_uuid;
  insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
  values (v_ordem, 'etapa', format('Etapa %s: %s', case when concluida then 'concluída' else 'reaberta' end, v_nome));
end;
$$;
revoke all on function public.atualizar_etapa_producao(uuid, boolean) from public, anon;
grant execute on function public.atualizar_etapa_producao(uuid, boolean) to authenticated;

-- ---------- 5) Salvar a ordem: complexidade e trechos abertos ----------
-- Igual à 0019, mais: `complexidade`; trocar as etapas ou cancelar a ordem fecha os trechos
-- abertos como pausa, para nenhum relógio ficar correndo.
create or replace function public.salvar_ordem_producao(dados jsonb, ordem_uuid uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_antiga public.ordens_producao%rowtype;
  v_status text := coalesce(nullif(dados->>'status', ''), 'Aguardando');
  v_servico uuid := nullif(dados->>'servico_id', '')::uuid;
  v_complexidade text := coalesce(nullif(dados->>'complexidade', ''), 'Média');
  v_etapas_alteradas boolean := false;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP criam e editam ordens de produção' using errcode = '42501';
  end if;
  if nullif(btrim(dados->>'descricao'), '') is null then raise exception 'Informe a descrição da ordem'; end if;
  if coalesce(dados->>'tipo', '') not in ('Instalação', 'Impressão') then raise exception 'Tipo de ordem inválido'; end if;
  if v_complexidade not in ('Simples', 'Média', 'Complexa') then raise exception 'Complexidade inválida'; end if;
  if dados->>'tipo' = 'Instalação' and nullif(btrim(dados->>'local_instalacao'), '') is null then
    raise exception 'Informe o local da instalação';
  end if;
  if jsonb_array_length(coalesce(dados->'etapas', '[]'::jsonb)) = 0 then
    raise exception 'A ordem precisa de pelo menos uma etapa';
  end if;

  if ordem_uuid is null then
    insert into public.ordens_producao (
      tipo, status, prioridade, complexidade, venda_id, cadastro_id, servico_id, descricao,
      data_prevista, local_instalacao, veiculo_id, observacao, created_by
    ) values (
      dados->>'tipo', 'Aguardando', coalesce(nullif(dados->>'prioridade', ''), 'Normal'), v_complexidade,
      nullif(dados->>'venda_id', '')::uuid, nullif(dados->>'cadastro_id', '')::uuid,
      v_servico, btrim(dados->>'descricao'), nullif(dados->>'data_prevista', '')::date,
      nullif(btrim(dados->>'local_instalacao'), ''), nullif(dados->>'veiculo_id', '')::uuid,
      nullif(dados->>'observacao', ''), auth.uid()
    ) returning id into v_id;
    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao) values (v_id, 'criacao', 'Ordem criada');
  else
    select * into v_antiga from public.ordens_producao where id = ordem_uuid for update;
    if not found then raise exception 'Ordem não encontrada'; end if;
    v_id := ordem_uuid;
    v_etapas_alteradas := v_antiga.servico_id is distinct from v_servico;
    update public.ordens_producao set
      tipo = dados->>'tipo',
      status = v_status,
      prioridade = coalesce(nullif(dados->>'prioridade', ''), 'Normal'),
      complexidade = v_complexidade,
      venda_id = nullif(dados->>'venda_id', '')::uuid,
      cadastro_id = nullif(dados->>'cadastro_id', '')::uuid,
      servico_id = v_servico,
      descricao = btrim(dados->>'descricao'),
      data_prevista = nullif(dados->>'data_prevista', '')::date,
      data_inicio = case when v_status = 'Em andamento' and data_inicio is null then now() else data_inicio end,
      data_conclusao = case when v_status = 'Concluída' then coalesce(data_conclusao, now()) else null end,
      local_instalacao = nullif(btrim(dados->>'local_instalacao'), ''),
      veiculo_id = nullif(dados->>'veiculo_id', '')::uuid,
      observacao = nullif(dados->>'observacao', '')
    where id = v_id;
    if v_antiga.status is distinct from v_status then
      insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
      values (v_id, 'status', format('Situação alterada de %s para %s', v_antiga.status, v_status));
    end if;
    if v_antiga.complexidade is distinct from v_complexidade then
      insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
      values (v_id, 'complexidade', format('Complexidade alterada de %s para %s', v_antiga.complexidade, v_complexidade));
    end if;
  end if;

  delete from public.ordens_producao_equipe where ordem_id = v_id;
  insert into public.ordens_producao_equipe (ordem_id, colaborador_id)
  select distinct v_id, value::uuid from jsonb_array_elements_text(coalesce(dados->'equipe', '[]'::jsonb));

  if v_etapas_alteradas or v_status = 'Cancelada' then
    update public.ordens_producao_apontamentos set
      fim = greatest(now(), inicio), fim_tipo = 'pausa',
      motivo_pausa = case when v_status = 'Cancelada' then 'Ordem cancelada' else 'Etapas da ordem trocadas' end,
      encerrado_por = auth.uid(), encerrado_por_nome = public.current_display_name()
    where ordem_id = v_id and fim is null;
  end if;

  if ordem_uuid is null or v_etapas_alteradas then
    delete from public.ordens_producao_etapas where ordem_id = v_id;
    insert into public.ordens_producao_etapas (ordem_id, ordem, nome)
    select v_id, n::integer, value from jsonb_array_elements_text(dados->'etapas') with ordinality as e(value, n);
  end if;

  if v_status = 'Concluída' and exists (
    select 1 from public.ordens_producao_etapas where ordem_id = v_id and not concluido
  ) then
    raise exception 'Conclua todas as etapas antes de concluir a ordem';
  end if;
  return v_id;
end;
$$;
revoke all on function public.salvar_ordem_producao(jsonb, uuid) from public, anon;
grant execute on function public.salvar_ordem_producao(jsonb, uuid) to authenticated;

-- ---------- 6) Amostras para a estimativa ----------
-- Uma linha por etapa concluída que teve tempo apontado, das mais recentes para as mais
-- antigas. `maior_trecho_horas` deixa o app descartar trechos esquecidos abertos.
-- security invoker: a leitura segue o RLS (equipe aprovada).
create or replace function public.amostras_tempo_etapas(limite integer default 2000)
returns table (
  etapa_id uuid,
  ordem_id uuid,
  servico_id uuid,
  etapa text,
  complexidade text,
  concluido_em timestamptz,
  horas numeric,
  maior_trecho_horas numeric,
  trechos integer
) language sql stable security invoker set search_path = public, pg_temp as $$
  select e.id, o.id, o.servico_id, e.nome, o.complexidade, e.concluido_em,
    round(sum(extract(epoch from (a.fim - a.inicio)) / 3600.0 * a.pessoas)::numeric, 3),
    round(max(extract(epoch from (a.fim - a.inicio)) / 3600.0)::numeric, 3),
    count(*)::integer
  from public.ordens_producao_etapas e
  join public.ordens_producao o on o.id = e.ordem_id
  join public.ordens_producao_apontamentos a on a.etapa_id = e.id and a.fim is not null
  where e.concluido and o.status <> 'Cancelada'
  group by e.id, o.id, o.servico_id, e.nome, o.complexidade, e.concluido_em
  order by e.concluido_em desc nulls last
  limit greatest(1, least(coalesce(limite, 2000), 10000));
$$;
revoke all on function public.amostras_tempo_etapas(integer) from public, anon;
grant execute on function public.amostras_tempo_etapas(integer) to authenticated;
