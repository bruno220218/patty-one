-- ============ CI de vinheta (Comunicação Interna) ============
-- Fluxo: o comercial cria a CI e marca os painéis -> cada painel fica com a vinheta
-- "aguardando entrada" e a Criação recebe o aviso -> a Criação aprova por painel e a
-- vinheta entra no espaço vago de número mais baixo (ou renova a do mesmo cliente).
-- Rode depois da 0011 e da 0012.

-- ---------- Tabelas ----------
create table if not exists public.cis (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,                         -- recomeça a cada mês: "10/Nov"
  mes date not null,                               -- primeiro dia do mês da CI
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  representante_nome text not null default '' check (length(representante_nome) <= 120),
  cliente text not null check (length(trim(cliente)) > 0 and length(cliente) <= 200),
  titulo text not null default '' check (length(titulo) <= 200),
  tipo text not null default 'venda'
    check (tipo in ('venda', 'permuta', 'camp_patty', 'doacao', 'reserva', 'evento')),
  inicio date,
  fim date,
  recebimento text not null default 'Normal' check (length(recebimento) <= 60),
  responsavel_insercao_nome text not null default '' check (length(responsavel_insercao_nome) <= 120),
  observacao text not null default '' check (length(observacao) <= 1000),
  -- Patty Móvel: {modalidade, endereco, responsavel, som_microfone, palco_escada, suporte_caixas, cabo_energia}
  movel jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_nome text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cis_periodo_check check (inicio is null or fim is null or fim >= inicio),
  constraint cis_numero_mes_unique unique (mes, numero)
);
create index if not exists cis_created_idx on public.cis (created_at desc);

create table if not exists public.ci_paineis (
  id uuid primary key default gen_random_uuid(),
  ci_id uuid not null references public.cis (id) on delete cascade,
  painel_id uuid not null references public.paineis (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  vinheta_id uuid references public.painel_vinhetas (id) on delete set null,
  posicao integer,
  renovacao boolean not null default false,
  motivo text not null default '' check (length(motivo) <= 500),
  decidido_por uuid references auth.users (id) on delete set null,
  decidido_por_nome text not null default '',
  decidido_em timestamptz,
  constraint ci_paineis_unico unique (ci_id, painel_id)
);
create index if not exists ci_paineis_pendentes_idx on public.ci_paineis (painel_id) where status = 'pendente';

-- A vinheta lembra de qual CI veio.
alter table public.painel_vinhetas add column if not exists ci_id uuid references public.cis (id) on delete set null;

-- ---------- Permissões ----------
-- Leitura para a equipe; toda escrita passa pelas funções abaixo (que conferem a função da pessoa).
alter table public.cis enable row level security;
alter table public.ci_paineis enable row level security;
revoke all on public.cis, public.ci_paineis from public, anon, authenticated;
grant select on public.cis, public.ci_paineis to authenticated;

drop policy if exists "cis_ver" on public.cis;
create policy "cis_ver" on public.cis for select to authenticated using (public.is_team_member(auth.uid()));
drop policy if exists "ci_paineis_ver" on public.ci_paineis;
create policy "ci_paineis_ver" on public.ci_paineis for select to authenticated using (public.is_team_member(auth.uid()));

create or replace function public.can_criar_ci(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial'])
$$;
revoke execute on function public.can_criar_ci(uuid) from public, anon;
grant execute on function public.can_criar_ci(uuid) to authenticated;

-- "10/Nov"
create or replace function public.ci_rotulo(_numero integer, _data date)
returns text language sql immutable as $$
  select lpad(_numero::text, 2, '0') || '/' ||
    (array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])[extract(month from _data)::int]
$$;

-- ---------- Avisos: novos tipos ----------
alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                  'liberacao_reprovada', 'liberacao_aprovada',
                  'briefing_novo', 'briefing_andamento', 'briefing_concluido',
                  'visita_nova', 'visita_agendada', 'visita_realizada', 'visita_cancelada',
                  'rgb_vencendo', 'rgb_vence_hoje', 'rgb_vencida',
                  'ci_nova', 'ci_vinheta_entrou', 'ci_recusada'));

-- ---------- Criar / editar CI ----------
-- _dados: {data, representante_nome, cliente, titulo, tipo, inicio, fim, recebimento,
--          responsavel_insercao_nome, observacao, movel}
-- Editar só enquanto nenhum painel foi aprovado ou recusado.
create or replace function public.salvar_ci(_id uuid, _dados jsonb, _paineis uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := _id;
  v_data date := coalesce(nullif(_dados->>'data', '')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_mes date := date_trunc('month', v_data)::date;
  v_numero integer;
  v_nome text := coalesce(nullif(public.current_display_name(), ''), 'Alguém da equipe');
  v_ci public.cis;
  v_paineis uuid[] := array(select distinct p from unnest(coalesce(_paineis, '{}')) p where p is not null);
  v_lista text;
begin
  if not public.can_criar_ci(auth.uid()) then
    raise exception 'Só o comercial e a gestão criam CIs.' using errcode = '42501';
  end if;
  if coalesce(trim(_dados->>'cliente'), '') = '' then
    raise exception 'Informe o cliente.' using errcode = '23514';
  end if;
  if cardinality(v_paineis) = 0 then
    raise exception 'Marque pelo menos um painel.' using errcode = '23514';
  end if;

  if v_id is null then
    -- Numeração do mês, sem repetir mesmo com duas CIs ao mesmo tempo.
    perform pg_advisory_xact_lock(hashtext('ci-numero-' || v_mes::text));
    select coalesce(max(numero), 0) + 1 into v_numero from public.cis where mes = v_mes;
    insert into public.cis (numero, mes, data, created_by, created_by_nome, cliente)
    values (v_numero, v_mes, v_data, auth.uid(), v_nome, trim(_dados->>'cliente'))
    returning id into v_id;
  else
    select * into v_ci from public.cis where id = v_id for update;
    if v_ci.id is null then
      raise exception 'CI não encontrada.' using errcode = 'P0002';
    end if;
    if v_ci.created_by is distinct from auth.uid() and not public.has_role(auth.uid(), 'gestor') then
      raise exception 'Só quem criou a CI (ou a gestão) pode alterá-la.' using errcode = '42501';
    end if;
    if exists (select 1 from public.ci_paineis where ci_id = v_id and status <> 'pendente') then
      raise exception 'A Criação já deu entrada nesta CI: ela não pode mais ser alterada.' using errcode = '42501';
    end if;
  end if;

  update public.cis set
    data = v_data,
    representante_nome = trim(coalesce(_dados->>'representante_nome', '')),
    cliente = trim(_dados->>'cliente'),
    titulo = trim(coalesce(_dados->>'titulo', '')),
    tipo = coalesce(nullif(_dados->>'tipo', ''), 'venda'),
    inicio = nullif(_dados->>'inicio', '')::date,
    fim = nullif(_dados->>'fim', '')::date,
    recebimento = coalesce(nullif(trim(_dados->>'recebimento'), ''), 'Normal'),
    responsavel_insercao_nome = trim(coalesce(_dados->>'responsavel_insercao_nome', '')),
    observacao = trim(coalesce(_dados->>'observacao', '')),
    movel = coalesce(_dados->'movel', '{}'::jsonb),
    updated_at = now()
  where id = v_id
  returning * into v_ci;

  delete from public.ci_paineis where ci_id = v_id and painel_id <> all (v_paineis);
  insert into public.ci_paineis (ci_id, painel_id)
  select v_id, p from unnest(v_paineis) p
  on conflict (ci_id, painel_id) do nothing;

  if _id is null then
    select string_agg(codigo, ', ' order by ordem) into v_lista
      from public.paineis where id = any (v_paineis);
    perform public.avisar(public.pessoas_com_funcao(array['criacao']), 'ci_nova', '/cis/' || v_id,
      v_ci.numero, v_ci.cliente,
      'CI ' || public.ci_rotulo(v_ci.numero, v_ci.data) || ' · entrar em ' || v_lista
        || case when v_ci.inicio is not null or v_ci.fim is not null then
             ' · ' || coalesce(to_char(v_ci.inicio, 'DD/MM'), '…') || ' a ' || coalesce(to_char(v_ci.fim, 'DD/MM'), 'sem fim')
           else '' end);
  end if;
  return v_id;
end $$;
revoke execute on function public.salvar_ci(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.salvar_ci(uuid, jsonb, uuid[]) to authenticated;

create or replace function public.excluir_ci(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ci public.cis;
begin
  select * into v_ci from public.cis where id = _id for update;
  if v_ci.id is null then return; end if;
  if v_ci.created_by is distinct from auth.uid() and not public.has_role(auth.uid(), 'gestor') then
    raise exception 'Só quem criou a CI (ou a gestão) pode excluí-la.' using errcode = '42501';
  end if;
  if exists (select 1 from public.ci_paineis where ci_id = _id and status <> 'pendente') then
    raise exception 'A Criação já deu entrada nesta CI: ela não pode ser excluída.' using errcode = '42501';
  end if;
  delete from public.cis where id = _id;
end $$;
revoke execute on function public.excluir_ci(uuid) from public, anon;
grant execute on function public.excluir_ci(uuid) to authenticated;

-- ---------- Dar entrada (Criação) ----------
-- Renovação: se o cliente já está no painel, atualiza a mesma vinheta (mesmo espaço).
-- Senão, ocupa o espaço vago de número mais baixo.
create or replace function public.aprovar_ci_painel(_ci_painel_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_cp public.ci_paineis;
  v_ci public.cis;
  v_painel public.paineis;
  v_vinheta uuid;
  v_posicao integer;
  v_renova boolean := false;
  v_rotulo text;
begin
  if not public.can_editar_paineis(auth.uid()) then
    raise exception 'Só a Criação e a gestão dão entrada nas vinhetas.' using errcode = '42501';
  end if;
  select * into v_cp from public.ci_paineis where id = _ci_painel_id for update;
  if v_cp.id is null then
    raise exception 'Entrada não encontrada.' using errcode = 'P0002';
  end if;
  if v_cp.status <> 'pendente' then
    raise exception 'Esta entrada já foi decidida.' using errcode = '23514';
  end if;
  select * into v_ci from public.cis where id = v_cp.ci_id;
  select * into v_painel from public.paineis where id = v_cp.painel_id for update;
  v_rotulo := public.ci_rotulo(v_ci.numero, v_ci.data);

  select id, posicao into v_vinheta, v_posicao
    from public.painel_vinhetas
   where painel_id = v_painel.id and retirada_em is null and tipo <> 'indisponivel'
     and lower(regexp_replace(cliente, '\s+', '', 'g')) = lower(regexp_replace(v_ci.cliente, '\s+', '', 'g'))
   order by posicao limit 1;

  if v_vinheta is not null then
    v_renova := true;
    update public.painel_vinhetas set
      ci = v_rotulo, ci_id = v_ci.id, tipo = v_ci.tipo, inicio = v_ci.inicio, fim = v_ci.fim,
      representante_nome = v_ci.representante_nome
    where id = v_vinheta;
  else
    select s into v_posicao
      from generate_series(1, v_painel.espacos) s
     where not exists (select 1 from public.painel_vinhetas
                        where painel_id = v_painel.id and posicao = s and retirada_em is null)
     order by s limit 1;
    if v_posicao is null then
      raise exception 'O % não tem espaço vago. Retire uma vinheta ou recuse esta entrada.', v_painel.codigo
        using errcode = '23514';
    end if;
    insert into public.painel_vinhetas
      (painel_id, posicao, cliente, ci, ci_id, tipo, inicio, fim, representante_nome,
       duracao_seg, loop, insercoes_dia, observacao)
    values
      (v_painel.id, v_posicao, v_ci.cliente, v_rotulo, v_ci.id, v_ci.tipo, v_ci.inicio, v_ci.fim,
       v_ci.representante_nome, v_painel.duracao_padrao, v_painel.loop_padrao, v_painel.insercoes_padrao, '')
    returning id into v_vinheta;
  end if;

  update public.ci_paineis set
    status = 'aprovada', vinheta_id = v_vinheta, posicao = v_posicao, renovacao = v_renova,
    decidido_por = auth.uid(), decidido_por_nome = public.current_display_name(), decidido_em = now()
  where id = v_cp.id;

  if v_ci.responsavel_insercao_nome = '' then
    update public.cis set responsavel_insercao_nome = public.current_display_name() where id = v_ci.id;
  end if;

  perform public.avisar(array[v_ci.created_by], 'ci_vinheta_entrou', '/cis/' || v_ci.id, v_ci.numero, v_ci.cliente,
    v_painel.codigo || ' · espaço ' || v_posicao || case when v_renova then ' (renovação)' else '' end);
  return v_posicao;
end $$;
revoke execute on function public.aprovar_ci_painel(uuid) from public, anon;
grant execute on function public.aprovar_ci_painel(uuid) to authenticated;

create or replace function public.recusar_ci_painel(_ci_painel_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cp public.ci_paineis;
  v_ci public.cis;
  v_codigo text;
begin
  if not public.can_editar_paineis(auth.uid()) then
    raise exception 'Só a Criação e a gestão decidem as entradas.' using errcode = '42501';
  end if;
  if coalesce(trim(_motivo), '') = '' then
    raise exception 'Diga o motivo da recusa.' using errcode = '23514';
  end if;
  select * into v_cp from public.ci_paineis where id = _ci_painel_id for update;
  if v_cp.id is null or v_cp.status <> 'pendente' then
    raise exception 'Esta entrada já foi decidida.' using errcode = '23514';
  end if;
  update public.ci_paineis set
    status = 'recusada', motivo = trim(_motivo),
    decidido_por = auth.uid(), decidido_por_nome = public.current_display_name(), decidido_em = now()
  where id = v_cp.id;
  select * into v_ci from public.cis where id = v_cp.ci_id;
  select codigo into v_codigo from public.paineis where id = v_cp.painel_id;
  perform public.avisar(array[v_ci.created_by], 'ci_recusada', '/cis/' || v_ci.id, v_ci.numero, v_ci.cliente,
    v_codigo || ': ' || trim(_motivo));
end $$;
revoke execute on function public.recusar_ci_painel(uuid, text) from public, anon;
grant execute on function public.recusar_ci_painel(uuid, text) to authenticated;
