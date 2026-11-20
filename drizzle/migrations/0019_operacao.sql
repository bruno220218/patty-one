-- ============ Operação (setor Produção), vinda do PattyOne ============
-- Ordens de produção (instalação e impressão) com etapas, histórico e alertas de prazo;
-- planejamento (cronograma) com reservas para urgência; equipes de planejamento;
-- veículos; colaboradores; produtos e serviços; programação de serviços dos 7 setores.
--
-- Quem pode o quê:
--   - toda a equipe aprovada vê (is_team_member)
--   - Gestão e PCP criam e editam ordens, agendamentos, programação e os cadastros
--     (equipes, veículos, colaboradores, produtos e serviços)        → can_gerir_operacao
--   - Gestão, PCP, Produção e Montagem marcam etapas das ordens e mudam a situação
--     dos serviços programados (concluído, não realizado…)             → can_executar_operacao
-- Imagens dos serviços e agendamentos ficam no Google Drive, como anexos
-- (entidade 'programacao' e 'agendamento'); nada vai para o Storage do Supabase.
-- O vínculo com pedido de venda (venda_id) e ponto de mídia (ponto_id) fica guardado,
-- mas a ligação com essas tabelas entra quando Comercial e Mídia OOH chegarem.
-- Rode depois da 0018. Pode rodar mais de uma vez.

-- ---------- 1) Permissões ----------
create or replace function public.can_gerir_operacao(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'pcp'])
$$;
create or replace function public.can_executar_operacao(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'pcp', 'producao', 'montagem'])
$$;
revoke execute on function public.can_gerir_operacao(uuid) from public, anon;
revoke execute on function public.can_executar_operacao(uuid) from public, anon;
grant execute on function public.can_gerir_operacao(uuid) to authenticated, service_role;
grant execute on function public.can_executar_operacao(uuid) to authenticated, service_role;

-- ---------- 2) Recursos: colaboradores, equipes, veículos, serviços, produtos ----------
create table if not exists public.producao_colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) > 0),
  empresa text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.producao_equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  setor text not null check (length(btrim(setor)) > 0),
  capacidade_horas_dia numeric(7,2) not null default 8 check (capacidade_horas_dia > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nome, setor)
);

create table if not exists public.producao_veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  apelido text,
  modelo text,
  marca text,
  cor text,
  renavam text,
  status text not null default 'ATIVO',
  seguro_vencimento date,
  equipe_id uuid references public.producao_equipes (id) on delete set null,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists producao_veiculos_equipe_id_idx on public.producao_veiculos (equipe_id);

create table if not exists public.producao_equipe_colaboradores (
  equipe_id uuid not null references public.producao_equipes (id) on delete cascade,
  colaborador_id uuid not null references public.producao_colaboradores (id) on delete restrict,
  primary key (equipe_id, colaborador_id)
);
create index if not exists producao_equipe_colaborador_idx on public.producao_equipe_colaboradores (colaborador_id, equipe_id);

create table if not exists public.producao_equipe_veiculos (
  equipe_id uuid not null references public.producao_equipes (id) on delete cascade,
  veiculo_id uuid not null references public.producao_veiculos (id) on delete restrict,
  primary key (equipe_id, veiculo_id)
);
create index if not exists producao_equipe_veiculo_idx on public.producao_equipe_veiculos (veiculo_id, equipe_id);

create table if not exists public.producao_servicos (
  id uuid primary key default gen_random_uuid(),
  id_sige integer not null unique,
  nome text not null,
  produto text,
  etapas jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.producao_mao_obra (
  id uuid primary key default gen_random_uuid(),
  categoria text not null unique,
  valor numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.programacao_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists programacao_produtos_nome_unico on public.programacao_produtos (lower(btrim(nome)));

-- ---------- 3) Ordens de produção ----------
create table if not exists public.ordens_producao (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated by default as identity unique,
  tipo text not null check (tipo in ('Instalação', 'Impressão')),
  status text not null default 'Aguardando' check (status in ('Aguardando', 'Em andamento', 'Concluída', 'Cancelada')),
  prioridade text not null default 'Normal' check (prioridade in ('Baixa', 'Normal', 'Alta', 'Urgente')),
  venda_id uuid,  -- pedido de venda (ligação entra com o módulo Comercial)
  cadastro_id uuid references public.cadastros (id) on delete set null,
  servico_id uuid references public.producao_servicos (id) on delete set null,
  descricao text not null,
  data_prevista date,
  data_inicio timestamptz,
  data_conclusao timestamptz,
  local_instalacao text,
  veiculo_id uuid references public.producao_veiculos (id) on delete set null,
  observacao text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ordens_producao_status_idx on public.ordens_producao (status);
create index if not exists ordens_producao_tipo_idx on public.ordens_producao (tipo);
create index if not exists ordens_producao_previsao_idx on public.ordens_producao (data_prevista);
create index if not exists ordens_producao_venda_idx on public.ordens_producao (venda_id);

create table if not exists public.ordens_producao_equipe (
  ordem_id uuid not null references public.ordens_producao (id) on delete cascade,
  colaborador_id uuid not null references public.producao_colaboradores (id) on delete restrict,
  primary key (ordem_id, colaborador_id)
);

create table if not exists public.ordens_producao_etapas (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_producao (id) on delete cascade,
  ordem integer not null,
  nome text not null,
  concluido boolean not null default false,
  concluido_em timestamptz,
  concluido_por uuid references auth.users (id) on delete set null,
  concluido_por_nome text not null default '',
  unique (ordem_id, ordem)
);
create index if not exists ordens_etapas_ordem_idx on public.ordens_producao_etapas (ordem_id, ordem);

-- Histórico: o nome de quem fez fica guardado, mesmo se a pessoa sair da equipe.
create table if not exists public.ordens_producao_eventos (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_producao (id) on delete cascade,
  tipo text not null,
  descricao text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_nome text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ordens_eventos_ordem_idx on public.ordens_producao_eventos (ordem_id, created_at desc);

-- ---------- 4) Planejamento (cronograma) ----------
create table if not exists public.planejamento_agendamentos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) > 0),
  tipo text not null default 'Agendamento' check (tipo in ('Agendamento', 'Reserva de urgência', 'Urgência')),
  data_inicio date not null,
  data_fim date not null,
  hora_inicio time,
  hora_fim time,
  veiculo_id uuid references public.producao_veiculos (id) on delete set null,
  ordem_id uuid references public.ordens_producao (id) on delete set null,
  equipe_id uuid references public.producao_equipes (id) on delete set null,
  observacao text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planejamento_periodo_valido check (data_fim >= data_inicio),
  constraint planejamento_horarios_preenchidos check ((hora_inicio is null) = (hora_fim is null)),
  constraint planejamento_horario_valido check (hora_inicio is null or hora_fim > hora_inicio)
);
create unique index if not exists planejamento_ordem_unica_idx on public.planejamento_agendamentos (ordem_id) where ordem_id is not null;
create index if not exists planejamento_periodo_idx on public.planejamento_agendamentos (data_inicio, data_fim);
create index if not exists planejamento_veiculo_periodo_idx on public.planejamento_agendamentos (veiculo_id, data_inicio, data_fim) where veiculo_id is not null;
create index if not exists planejamento_equipe_periodo_idx on public.planejamento_agendamentos (equipe_id, data_inicio, data_fim) where equipe_id is not null;

create table if not exists public.planejamento_agendamento_equipe (
  agendamento_id uuid not null references public.planejamento_agendamentos (id) on delete cascade,
  colaborador_id uuid not null references public.producao_colaboradores (id) on delete restrict,
  primary key (agendamento_id, colaborador_id)
);
create index if not exists planejamento_equipe_colaborador_idx on public.planejamento_agendamento_equipe (colaborador_id, agendamento_id);

-- ---------- 5) Programação de serviços (7 setores) ----------
create table if not exists public.programacao_servicos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  data_original date not null,
  setor text not null check (setor in ('Externa', 'Projetos especiais', 'Serralheria', 'Acabamento e montagem', 'Produção', 'Corte', 'Pintura')),
  cadastro_id uuid references public.cadastros (id) on delete set null,
  cliente text,
  produto text,
  servico text not null,
  detalhamento text,
  ponto_id uuid,  -- ponto de mídia (ligação entra com o módulo Mídia OOH)
  local text,
  quantidade numeric not null default 1 check (quantidade > 0),
  equipe_id uuid references public.producao_equipes (id) on delete set null,
  lider_id uuid references public.producao_colaboradores (id) on delete set null,
  veiculo_id uuid references public.producao_veiculos (id) on delete set null,
  ordem_id uuid references public.ordens_producao (id) on delete set null,
  hora_inicio time,
  hora_fim time,
  status text not null default 'Programado' check (status in ('Programado', 'Em andamento', 'Concluído', 'Não realizado', 'Aguardando equipe')),
  observacao text,
  posicao integer not null default 0,
  reagendamentos integer not null default 0,
  -- Confirmação informativa de funcionário ou veículo em mais de um serviço no dia; nunca bloqueia.
  conflito_confirmado boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((hora_inicio is null) = (hora_fim is null) and (hora_fim is null or hora_fim > hora_inicio))
);
create index if not exists programacao_servicos_data_idx on public.programacao_servicos (data, setor, posicao);
create index if not exists programacao_servicos_status_idx on public.programacao_servicos (status) where status in ('Não realizado', 'Aguardando equipe');

create table if not exists public.programacao_servicos_ajudantes (
  servico_id uuid not null references public.programacao_servicos (id) on delete cascade,
  colaborador_id uuid not null references public.producao_colaboradores (id) on delete restrict,
  primary key (servico_id, colaborador_id)
);

-- ---------- 6) Gatilhos ----------
drop trigger if exists producao_equipes_touch on public.producao_equipes;
create trigger producao_equipes_touch before update on public.producao_equipes
  for each row execute function public.touch_updated_at();
drop trigger if exists programacao_produtos_touch on public.programacao_produtos;
create trigger programacao_produtos_touch before update on public.programacao_produtos
  for each row execute function public.touch_updated_at();
drop trigger if exists ordens_producao_touch on public.ordens_producao;
create trigger ordens_producao_touch before update on public.ordens_producao
  for each row execute function public.touch_updated_at();
drop trigger if exists planejamento_agendamentos_touch on public.planejamento_agendamentos;
create trigger planejamento_agendamentos_touch before update on public.planejamento_agendamentos
  for each row execute function public.touch_updated_at();
drop trigger if exists programacao_servicos_touch on public.programacao_servicos;
create trigger programacao_servicos_touch before update on public.programacao_servicos
  for each row execute function public.touch_updated_at();

create or replace function public.ordens_eventos_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_by_nome := public.current_display_name();
  return new;
end $$;
revoke execute on function public.ordens_eventos_carimbo() from public, anon, authenticated;
drop trigger if exists ordens_eventos_carimbo on public.ordens_producao_eventos;
create trigger ordens_eventos_carimbo before insert on public.ordens_producao_eventos
  for each row execute function public.ordens_eventos_carimbo();

-- ---------- 7) Acesso às tabelas ----------
do $$
declare t text;
begin
  foreach t in array array[
    'producao_colaboradores', 'producao_equipes', 'producao_veiculos', 'producao_equipe_colaboradores',
    'producao_equipe_veiculos', 'producao_servicos', 'producao_mao_obra', 'programacao_produtos',
    'ordens_producao', 'ordens_producao_equipe', 'ordens_producao_etapas', 'ordens_producao_eventos',
    'planejamento_agendamentos', 'planejamento_agendamento_equipe',
    'programacao_servicos', 'programacao_servicos_ajudantes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists equipe_le on public.%I', t);
    execute format('create policy equipe_le on public.%I for select to authenticated using (public.is_team_member(auth.uid()))', t);
  end loop;

  -- Cadastros da operação: Gestão e PCP alteram direto na tabela.
  foreach t in array array[
    'producao_colaboradores', 'producao_veiculos', 'producao_servicos', 'producao_mao_obra', 'programacao_produtos'
  ] loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists gestao_pcp_altera on public.%I', t);
    execute format('create policy gestao_pcp_altera on public.%I for all to authenticated using (public.can_gerir_operacao(auth.uid())) with check (public.can_gerir_operacao(auth.uid()))', t);
  end loop;

  -- Programação: salva em lote com as permissões de quem chama (Gestão e PCP).
  foreach t in array array['programacao_servicos', 'programacao_servicos_ajudantes'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists gestao_pcp_altera on public.%I', t);
    execute format('create policy gestao_pcp_altera on public.%I for all to authenticated using (public.can_gerir_operacao(auth.uid())) with check (public.can_gerir_operacao(auth.uid()))', t);
  end loop;
end $$;

-- Excluir uma ordem: Gestão e PCP (o resto passa pelas rotinas abaixo).
grant delete on public.ordens_producao to authenticated;
drop policy if exists gestao_pcp_exclui on public.ordens_producao;
create policy gestao_pcp_exclui on public.ordens_producao for delete to authenticated
  using (public.can_gerir_operacao(auth.uid()));

-- ---------- 8) Ordens: salvar e marcar etapas ----------
create or replace function public.salvar_ordem_producao(dados jsonb, ordem_uuid uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_antiga public.ordens_producao%rowtype;
  v_status text := coalesce(nullif(dados->>'status', ''), 'Aguardando');
  v_servico uuid := nullif(dados->>'servico_id', '')::uuid;
  v_etapas_alteradas boolean := false;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP criam e editam ordens de produção' using errcode = '42501';
  end if;
  if nullif(btrim(dados->>'descricao'), '') is null then raise exception 'Informe a descrição da ordem'; end if;
  if coalesce(dados->>'tipo', '') not in ('Instalação', 'Impressão') then raise exception 'Tipo de ordem inválido'; end if;
  if dados->>'tipo' = 'Instalação' and nullif(btrim(dados->>'local_instalacao'), '') is null then
    raise exception 'Informe o local da instalação';
  end if;
  if jsonb_array_length(coalesce(dados->'etapas', '[]'::jsonb)) = 0 then
    raise exception 'A ordem precisa de pelo menos uma etapa';
  end if;

  if ordem_uuid is null then
    insert into public.ordens_producao (
      tipo, status, prioridade, venda_id, cadastro_id, servico_id, descricao,
      data_prevista, local_instalacao, veiculo_id, observacao, created_by
    ) values (
      dados->>'tipo', 'Aguardando', coalesce(nullif(dados->>'prioridade', ''), 'Normal'),
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
  end if;

  delete from public.ordens_producao_equipe where ordem_id = v_id;
  insert into public.ordens_producao_equipe (ordem_id, colaborador_id)
  select distinct v_id, value::uuid from jsonb_array_elements_text(coalesce(dados->'equipe', '[]'::jsonb));

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

-- ---------- 9) Equipes de planejamento ----------
create or replace function public.salvar_equipe_producao(dados jsonb, equipe_uuid uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_nome text := btrim(coalesce(dados->>'nome', ''));
  v_setor text := btrim(coalesce(dados->>'setor', ''));
  v_capacidade numeric := coalesce((dados->>'capacidade_horas_dia')::numeric, 0);
  v_ativo boolean := coalesce((dados->>'ativo')::boolean, true);
  v_colaboradores uuid[];
  v_veiculos uuid[];
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP cadastram equipes' using errcode = '42501';
  end if;
  if v_nome = '' then raise exception 'Informe o nome da equipe'; end if;
  if v_setor = '' then raise exception 'Informe o setor da equipe'; end if;
  if v_capacidade <= 0 then raise exception 'A capacidade diária deve ser maior que zero'; end if;

  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into v_colaboradores
  from jsonb_array_elements_text(coalesce(dados->'colaboradores', '[]'::jsonb));
  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into v_veiculos
  from jsonb_array_elements_text(coalesce(dados->'veiculos', '[]'::jsonb));
  if coalesce(array_length(v_colaboradores, 1), 0) = 0 and coalesce(array_length(v_veiculos, 1), 0) = 0 then
    raise exception 'Selecione pelo menos um colaborador ou um veículo';
  end if;
  if exists (
    select 1 from unnest(v_colaboradores) as ids(id)
    left join public.producao_colaboradores c on c.id = ids.id
    where c.id is null or not c.ativo
  ) then raise exception 'A equipe contém um colaborador inválido ou inativo'; end if;
  if exists (
    select 1 from unnest(v_veiculos) as ids(id)
    left join public.producao_veiculos v on v.id = ids.id
    where v.id is null or v.status <> 'ATIVO'
  ) then raise exception 'A equipe contém um veículo inválido ou inativo'; end if;

  if equipe_uuid is null then
    insert into public.producao_equipes (nome, setor, capacidade_horas_dia, ativo)
    values (v_nome, v_setor, v_capacidade, v_ativo) returning id into v_id;
  else
    update public.producao_equipes set nome = v_nome, setor = v_setor, capacidade_horas_dia = v_capacidade, ativo = v_ativo
    where id = equipe_uuid returning id into v_id;
    if not found then raise exception 'Equipe não encontrada'; end if;
  end if;

  delete from public.producao_equipe_colaboradores where equipe_id = v_id;
  insert into public.producao_equipe_colaboradores (equipe_id, colaborador_id)
  select v_id, item.colaborador_id from unnest(v_colaboradores) as item(colaborador_id);
  delete from public.producao_equipe_veiculos where equipe_id = v_id;
  insert into public.producao_equipe_veiculos (equipe_id, veiculo_id)
  select v_id, item.veiculo_id from unnest(v_veiculos) as item(veiculo_id);
  return v_id;
exception
  when unique_violation then raise exception 'Já existe uma equipe com este nome neste setor';
end;
$$;
revoke all on function public.salvar_equipe_producao(jsonb, uuid) from public, anon;
grant execute on function public.salvar_equipe_producao(jsonb, uuid) to authenticated;

-- ---------- 10) Planejamento: salvar (com conflitos e reservas) e excluir ----------
create or replace function public.salvar_planejamento(dados jsonb, agendamento_uuid uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_titulo text := btrim(coalesce(dados->>'titulo', ''));
  v_tipo text := coalesce(nullif(dados->>'tipo', ''), 'Agendamento');
  v_inicio date;
  v_fim date;
  v_hora_inicio time := nullif(dados->>'hora_inicio', '')::time;
  v_hora_fim time := nullif(dados->>'hora_fim', '')::time;
  v_veiculo uuid := nullif(dados->>'veiculo_id', '')::uuid;
  v_ordem uuid := nullif(dados->>'ordem_id', '')::uuid;
  v_equipe_id uuid := nullif(dados->>'equipe_id', '')::uuid;
  v_equipe uuid[];
  v_conflito record;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP alteram o cronograma' using errcode = '42501';
  end if;
  if v_titulo = '' then raise exception 'Informe o título do agendamento'; end if;
  if v_tipo not in ('Agendamento', 'Reserva de urgência', 'Urgência') then raise exception 'Tipo de agendamento inválido'; end if;
  if nullif(dados->>'data_inicio', '') is null or nullif(dados->>'data_fim', '') is null then
    raise exception 'Informe o período do agendamento';
  end if;
  v_inicio := (dados->>'data_inicio')::date;
  v_fim := (dados->>'data_fim')::date;
  if v_fim < v_inicio then raise exception 'A data final deve ser igual ou posterior à inicial'; end if;
  if (v_hora_inicio is null) <> (v_hora_fim is null) then
    raise exception 'Preencha o horário inicial e final, ou deixe ambos vazios';
  end if;
  if v_hora_inicio is not null and v_hora_fim <= v_hora_inicio then
    raise exception 'O horário final deve ser posterior ao inicial';
  end if;

  if v_equipe_id is not null then
    if not exists (select 1 from public.producao_equipes where id = v_equipe_id and ativo) then
      raise exception 'Selecione uma equipe ativa';
    end if;
    select coalesce(array_agg(ec.colaborador_id), '{}'::uuid[]) into v_equipe
    from public.producao_equipe_colaboradores ec where ec.equipe_id = v_equipe_id;
    if v_veiculo is null then
      select ev.veiculo_id into v_veiculo from public.producao_equipe_veiculos ev
      join public.producao_veiculos v on v.id = ev.veiculo_id and v.status = 'ATIVO'
      where ev.equipe_id = v_equipe_id order by v.placa limit 1;
    end if;
    if v_veiculo is not null and not exists (
      select 1 from public.producao_equipe_veiculos where equipe_id = v_equipe_id and veiculo_id = v_veiculo
    ) then raise exception 'O veículo selecionado não pertence à equipe'; end if;
  else
    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into v_equipe
    from jsonb_array_elements_text(coalesce(dados->'equipe', '[]'::jsonb));
  end if;

  if coalesce(array_length(v_equipe, 1), 0) = 0 and v_veiculo is null then
    raise exception 'Selecione pelo menos um colaborador ou um veículo';
  end if;
  if exists (
    select 1 from unnest(v_equipe) as ids(id)
    left join public.producao_colaboradores c on c.id = ids.id
    where c.id is null or not c.ativo
  ) then raise exception 'A equipe contém um colaborador inválido ou inativo'; end if;
  if v_veiculo is not null and not exists (select 1 from public.producao_veiculos where id = v_veiculo and status = 'ATIVO') then
    raise exception 'Selecione um veículo ativo';
  end if;
  if v_ordem is not null and not exists (select 1 from public.ordens_producao where id = v_ordem) then
    raise exception 'Ordem de produção não encontrada';
  end if;

  perform pg_advisory_xact_lock(724601);
  if v_ordem is not null and exists (
    select 1 from public.planejamento_agendamentos
    where ordem_id = v_ordem and (agendamento_uuid is null or id <> agendamento_uuid)
  ) then raise exception 'Esta ordem de produção já possui um agendamento'; end if;

  -- Conflito: mesmo veículo ou colaborador no mesmo período/horário. Uma urgência pode
  -- usar uma reserva de urgência, mas não pode sobrepor trabalho comum.
  select a.id, a.titulo, a.tipo into v_conflito
  from public.planejamento_agendamentos a
  where (agendamento_uuid is null or a.id <> agendamento_uuid)
    and a.data_inicio <= v_fim and a.data_fim >= v_inicio
    and (
      (v_veiculo is not null and a.veiculo_id = v_veiculo)
      or exists (
        select 1 from public.planejamento_agendamento_equipe e
        where e.agendamento_id = a.id and e.colaborador_id = any (v_equipe)
      )
    )
    and (
      v_hora_inicio is null or a.hora_inicio is null
      or (v_hora_inicio < a.hora_fim and v_hora_fim > a.hora_inicio)
    )
    and (v_tipo <> 'Urgência' or a.tipo <> 'Reserva de urgência')
  order by a.data_inicio, a.hora_inicio nulls first
  limit 1;
  if found then
    raise exception 'Conflito com o agendamento "%" (%). Escolha outro recurso ou horário', v_conflito.titulo, v_conflito.tipo;
  end if;

  if agendamento_uuid is null then
    insert into public.planejamento_agendamentos (
      titulo, tipo, data_inicio, data_fim, hora_inicio, hora_fim,
      veiculo_id, ordem_id, equipe_id, observacao, created_by
    ) values (
      v_titulo, v_tipo, v_inicio, v_fim, v_hora_inicio, v_hora_fim,
      v_veiculo, v_ordem, v_equipe_id, nullif(btrim(coalesce(dados->>'observacao', '')), ''), auth.uid()
    ) returning id into v_id;
  else
    update public.planejamento_agendamentos set
      titulo = v_titulo, tipo = v_tipo, data_inicio = v_inicio, data_fim = v_fim,
      hora_inicio = v_hora_inicio, hora_fim = v_hora_fim, veiculo_id = v_veiculo,
      ordem_id = v_ordem, equipe_id = v_equipe_id,
      observacao = nullif(btrim(coalesce(dados->>'observacao', '')), '')
    where id = agendamento_uuid returning id into v_id;
    if not found then raise exception 'Agendamento não encontrado'; end if;
  end if;

  delete from public.planejamento_agendamento_equipe where agendamento_id = v_id;
  insert into public.planejamento_agendamento_equipe (agendamento_id, colaborador_id)
  select v_id, equipe.colaborador_id from unnest(v_equipe) as equipe(colaborador_id);
  return v_id;
end;
$$;
revoke all on function public.salvar_planejamento(jsonb, uuid) from public, anon;
grant execute on function public.salvar_planejamento(jsonb, uuid) to authenticated;

create or replace function public.excluir_planejamento(agendamento_uuid uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP alteram o cronograma' using errcode = '42501';
  end if;
  delete from public.planejamento_agendamentos where id = agendamento_uuid;
  if not found then raise exception 'Agendamento não encontrado'; end if;
  delete from public.anexos where entidade = 'agendamento' and entidade_id = agendamento_uuid;
end;
$$;
revoke all on function public.excluir_planejamento(uuid) from public, anon;
grant execute on function public.excluir_planejamento(uuid) to authenticated;

-- ---------- 11) Programação: salvar em lote, reagendar e mudar situação ----------
create or replace function public.salvar_programacao_lote(linhas jsonb, excluir uuid[] default '{}')
returns integer language plpgsql security invoker set search_path = public as $$
declare
  l jsonb; v_id uuid; v_data date; v_n integer := 0; v_pos integer := 0;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP lançam a programação' using errcode = '42501';
  end if;
  if coalesce(array_length(excluir, 1), 0) > 0 then
    delete from public.programacao_servicos where id = any (excluir);
  end if;
  for l in select * from jsonb_array_elements(coalesce(linhas, '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    if nullif(l->>'data', '') is null then raise exception 'Linha %: informe a data', v_pos; end if;
    if btrim(coalesce(l->>'setor', '')) = '' then raise exception 'Linha %: informe o setor', v_pos; end if;
    if btrim(coalesce(l->>'servico', '')) = '' then raise exception 'Linha %: informe o serviço', v_pos; end if;
    v_data := (l->>'data')::date;
    v_id := nullif(l->>'id', '')::uuid;
    if v_id is null then
      insert into public.programacao_servicos (data, data_original, setor, cadastro_id, cliente, produto, servico,
        detalhamento, ponto_id, local, quantidade, equipe_id, lider_id, veiculo_id, ordem_id, hora_inicio, hora_fim,
        status, observacao, posicao, conflito_confirmado, created_by)
      values (v_data, v_data, l->>'setor', nullif(l->>'cadastro_id', '')::uuid, nullif(btrim(l->>'cliente'), ''),
        nullif(btrim(l->>'produto'), ''), btrim(l->>'servico'), nullif(btrim(l->>'detalhamento'), ''),
        nullif(l->>'ponto_id', '')::uuid, nullif(btrim(l->>'local'), ''),
        coalesce(nullif(l->>'quantidade', '')::numeric, 1), nullif(l->>'equipe_id', '')::uuid,
        nullif(l->>'lider_id', '')::uuid, nullif(l->>'veiculo_id', '')::uuid, nullif(l->>'ordem_id', '')::uuid,
        nullif(l->>'hora_inicio', '')::time, nullif(l->>'hora_fim', '')::time,
        coalesce(nullif(l->>'status', ''), 'Programado'), nullif(btrim(l->>'observacao'), ''),
        coalesce(nullif(l->>'posicao', '')::int, v_pos), coalesce((l->>'conflito_confirmado')::boolean, false), auth.uid())
      returning id into v_id;
    else
      update public.programacao_servicos set
        reagendamentos = reagendamentos + case when data <> v_data then 1 else 0 end,
        data = v_data, setor = l->>'setor', cadastro_id = nullif(l->>'cadastro_id', '')::uuid,
        cliente = nullif(btrim(l->>'cliente'), ''), produto = nullif(btrim(l->>'produto'), ''),
        servico = btrim(l->>'servico'), detalhamento = nullif(btrim(l->>'detalhamento'), ''),
        ponto_id = nullif(l->>'ponto_id', '')::uuid, local = nullif(btrim(l->>'local'), ''),
        quantidade = coalesce(nullif(l->>'quantidade', '')::numeric, 1), equipe_id = nullif(l->>'equipe_id', '')::uuid,
        lider_id = nullif(l->>'lider_id', '')::uuid, veiculo_id = nullif(l->>'veiculo_id', '')::uuid,
        ordem_id = nullif(l->>'ordem_id', '')::uuid, hora_inicio = nullif(l->>'hora_inicio', '')::time,
        hora_fim = nullif(l->>'hora_fim', '')::time, status = coalesce(nullif(l->>'status', ''), 'Programado'),
        observacao = nullif(btrim(l->>'observacao'), ''), posicao = coalesce(nullif(l->>'posicao', '')::int, v_pos),
        conflito_confirmado = coalesce((l->>'conflito_confirmado')::boolean, false)
      where id = v_id;
      if not found then raise exception 'Linha %: serviço não encontrado', v_pos; end if;
      delete from public.programacao_servicos_ajudantes where servico_id = v_id;
    end if;
    insert into public.programacao_servicos_ajudantes (servico_id, colaborador_id)
    select distinct v_id, value::uuid from jsonb_array_elements_text(coalesce(l->'ajudantes', '[]'::jsonb))
    where value::uuid is distinct from nullif(l->>'lider_id', '')::uuid;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.salvar_programacao_lote(jsonb, uuid[]) from public, anon;
grant execute on function public.salvar_programacao_lote(jsonb, uuid[]) to authenticated;

create or replace function public.reagendar_programacao(servico_uuid uuid, nova_data date, nova_equipe uuid default null,
  novo_lider uuid default null, novo_veiculo uuid default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP reagendam serviços' using errcode = '42501';
  end if;
  if nova_data is null then raise exception 'Informe a nova data'; end if;
  update public.programacao_servicos set
    data = nova_data, status = 'Programado', reagendamentos = reagendamentos + 1,
    equipe_id = coalesce(nova_equipe, equipe_id), lider_id = coalesce(novo_lider, lider_id),
    veiculo_id = coalesce(novo_veiculo, veiculo_id), conflito_confirmado = false
  where id = servico_uuid;
  if not found then raise exception 'Serviço não encontrado'; end if;
end;
$$;
revoke execute on function public.reagendar_programacao(uuid, date, uuid, uuid, uuid) from public, anon;
grant execute on function public.reagendar_programacao(uuid, date, uuid, uuid, uuid) to authenticated;

-- Quem executa (Produção/Montagem) só muda a situação e o motivo, não o resto da linha.
create or replace function public.atualizar_status_programacao(servico_uuid uuid, novo_status text, motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_executar_operacao(auth.uid()) then
    raise exception 'Só Gestão, PCP, Produção e Montagem mudam a situação dos serviços' using errcode = '42501';
  end if;
  if novo_status not in ('Programado', 'Em andamento', 'Concluído', 'Não realizado', 'Aguardando equipe') then
    raise exception 'Situação inválida';
  end if;
  update public.programacao_servicos set
    status = novo_status,
    observacao = coalesce(nullif(btrim(coalesce(motivo, '')), ''), observacao)
  where id = servico_uuid;
  if not found then raise exception 'Serviço não encontrado'; end if;
end;
$$;
revoke execute on function public.atualizar_status_programacao(uuid, text, text) from public, anon;
grant execute on function public.atualizar_status_programacao(uuid, text, text) to authenticated;

-- Excluir serviços também remove os links das imagens.
create or replace function public.programacao_limpa_anexos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.anexos where entidade = 'programacao' and entidade_id = old.id;
  return old;
end $$;
revoke execute on function public.programacao_limpa_anexos() from public, anon, authenticated;
drop trigger if exists programacao_limpa_anexos on public.programacao_servicos;
create trigger programacao_limpa_anexos after delete on public.programacao_servicos
  for each row execute function public.programacao_limpa_anexos();

-- ---------- 12) Catálogos, veículos e colaboradores ----------
create or replace function public.criar_servico_producao(p_nome text, p_produto text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_sige integer;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP cadastram serviços' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then raise exception 'Informe o nome do serviço'; end if;
  perform pg_advisory_xact_lock(724191);
  select coalesce(max(id_sige), 0) + 1 into v_sige from public.producao_servicos;
  insert into public.producao_servicos (id_sige, nome, produto, etapas, ativo)
  values (v_sige, btrim(p_nome), nullif(btrim(coalesce(p_produto, '')), ''), '[]'::jsonb, true)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.criar_servico_producao(text, text) from public, anon;
grant execute on function public.criar_servico_producao(text, text) to authenticated;

-- Item já usado é só desativado (some das listas, o histórico fica).
create or replace function public.excluir_item_catalogo_programacao(p_tipo text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_usado boolean;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP excluem itens do catálogo' using errcode = '42501';
  end if;
  if p_tipo = 'produto' then
    select nome into v_nome from public.programacao_produtos where id = p_id for update;
    if not found then raise exception 'Produto não encontrado'; end if;
    select exists (select 1 from public.programacao_servicos where produto = v_nome) into v_usado;
    if v_usado then
      update public.programacao_produtos set ativo = false where id = p_id;
      return 'desativado';
    end if;
    delete from public.programacao_produtos where id = p_id;
    return 'excluido';
  elsif p_tipo = 'servico' then
    select nome into v_nome from public.producao_servicos where id = p_id for update;
    if not found then raise exception 'Serviço não encontrado'; end if;
    select exists (select 1 from public.programacao_servicos where servico = v_nome)
      or exists (select 1 from public.ordens_producao where servico_id = p_id)
      into v_usado;
    if v_usado then
      update public.producao_servicos set ativo = false where id = p_id;
      return 'desativado';
    end if;
    delete from public.producao_servicos where id = p_id;
    return 'excluido';
  end if;
  raise exception 'Tipo de catálogo inválido';
end;
$$;
revoke all on function public.excluir_item_catalogo_programacao(text, uuid) from public, anon;
grant execute on function public.excluir_item_catalogo_programacao(text, uuid) to authenticated;

create or replace function public.excluir_veiculo(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_usado boolean;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP excluem veículos' using errcode = '42501';
  end if;
  perform 1 from public.producao_veiculos where id = p_id for update;
  if not found then raise exception 'Veículo não encontrado'; end if;
  select exists (select 1 from public.programacao_servicos where veiculo_id = p_id)
    or exists (select 1 from public.planejamento_agendamentos where veiculo_id = p_id)
    or exists (select 1 from public.ordens_producao where veiculo_id = p_id)
    into v_usado;
  if v_usado then
    update public.producao_veiculos set status = 'INATIVO' where id = p_id;
    return 'desativado';
  end if;
  delete from public.producao_equipe_veiculos where veiculo_id = p_id;
  delete from public.producao_veiculos where id = p_id;
  return 'excluido';
end;
$$;
revoke all on function public.excluir_veiculo(uuid) from public, anon;
grant execute on function public.excluir_veiculo(uuid) to authenticated;

create or replace function public.excluir_colaborador(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_usado boolean;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP excluem colaboradores' using errcode = '42501';
  end if;
  perform 1 from public.producao_colaboradores where id = p_id for update;
  if not found then raise exception 'Colaborador não encontrado'; end if;
  select exists (select 1 from public.programacao_servicos where lider_id = p_id)
    or exists (select 1 from public.programacao_servicos_ajudantes where colaborador_id = p_id)
    or exists (select 1 from public.planejamento_agendamento_equipe where colaborador_id = p_id)
    or exists (select 1 from public.ordens_producao_equipe where colaborador_id = p_id)
    into v_usado;
  if v_usado then
    update public.producao_colaboradores set ativo = false where id = p_id;
    delete from public.producao_equipe_colaboradores where colaborador_id = p_id;
    return 'desativado';
  end if;
  delete from public.producao_equipe_colaboradores where colaborador_id = p_id;
  delete from public.producao_colaboradores where id = p_id;
  return 'excluido';
end;
$$;
revoke all on function public.excluir_colaborador(uuid) from public, anon;
grant execute on function public.excluir_colaborador(uuid) to authenticated;

-- ---------- 13) Imagens no Drive: anexos de serviços programados e agendamentos ----------
alter table public.anexos drop constraint if exists anexos_entidade_check;
alter table public.anexos add constraint anexos_entidade_check
  check (entidade in ('liberacao', 'briefing', 'briefing_entrega', 'visita', 'ci', 'ci_foto',
                      'programacao', 'agendamento'));
