-- ============ Painéis RGB ============
-- Controle das vinhetas que rodam nos painéis de LED da cidade (antes na planilha "RGB").
-- 1) Painéis (RGB 1 a 7 e PA01) e as vinhetas em cada espaço
-- 2) Quem pode o quê: todos da equipe veem; Criação e Gestão editam
-- 3) Histórico: toda mudança fica registrada com quem fez e quando
-- 4) Avisos de vencimento no sino (7 dias antes, no dia e depois de vencido)
-- Os dados atuais da planilha entram pela migração 0012.

-- ---------- 1) Tabelas ----------
create table if not exists public.paineis (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (length(trim(codigo)) > 0),   -- "RGB 1", "PA01"
  nome text not null default '',                                    -- "Painel Shopping"
  espacos integer not null check (espacos between 1 and 60),        -- vagas no loop
  duracao_padrao integer not null default 10 check (duracao_padrao between 1 and 600),
  loop_padrao text not null default '4x',
  insercoes_padrao integer not null default 300 check (insercoes_padrao between 0 and 100000),
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.painel_vinhetas (
  id uuid primary key default gen_random_uuid(),
  painel_id uuid not null references public.paineis (id) on delete cascade,
  posicao integer not null check (posicao >= 1),
  cliente text not null check (length(trim(cliente)) > 0 and length(cliente) <= 200),
  ci text not null default '' check (length(ci) <= 40),
  tipo text not null default 'venda'
    check (tipo in ('venda', 'permuta', 'camp_patty', 'doacao', 'reserva', 'evento', 'indisponivel')),
  -- 'indisponivel' = espaço bloqueado (não está à venda).
  inicio date,
  fim date,
  -- Nome como na planilha ("Laila"); o app liga à pessoa da equipe com esse nome.
  representante_nome text not null default '' check (length(representante_nome) <= 120),
  representante_id uuid references auth.users (id) on delete set null,
  duracao_seg integer not null default 10 check (duracao_seg between 1 and 600),
  loop text not null default '4x' check (length(loop) <= 10),
  insercoes_dia integer not null default 300 check (insercoes_dia between 0 and 100000),
  observacao text not null default '' check (length(observacao) <= 1000),
  -- Retirada do painel: sai do espaço e fica só no histórico.
  retirada_em timestamptz,
  retirada_por_nome text not null default '',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_nome text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_nome text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint painel_vinhetas_periodo_check check (inicio is null or fim is null or fim >= inicio)
);

-- Um espaço só tem uma vinheta no ar.
create unique index if not exists painel_vinhetas_espaco_ocupado
  on public.painel_vinhetas (painel_id, posicao) where retirada_em is null;
create index if not exists painel_vinhetas_fim_idx
  on public.painel_vinhetas (fim) where retirada_em is null;

create table if not exists public.painel_historico (
  id uuid primary key default gen_random_uuid(),
  painel_id uuid references public.paineis (id) on delete cascade,
  vinheta_id uuid references public.painel_vinhetas (id) on delete set null,
  acao text not null check (acao in ('criada', 'alterada', 'retirada', 'importada')),
  cliente text not null default '',
  posicao integer,
  -- Só os campos que mudaram: {"fim": {"de": "2026-11-28", "para": "2026-12-28"}}
  mudancas jsonb not null default '{}'::jsonb,
  feito_por uuid references auth.users (id) on delete set null,
  feito_por_nome text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists painel_historico_painel_idx
  on public.painel_historico (painel_id, created_at desc);

-- Controle dos avisos já dados (um por etapa e por data de fim: renovar rearma).
create table if not exists public.painel_avisos_dados (
  vinheta_id uuid not null references public.painel_vinhetas (id) on delete cascade,
  etapa text not null check (etapa in ('vencendo', 'hoje', 'vencida')),
  fim date not null,
  created_at timestamptz not null default now(),
  primary key (vinheta_id, etapa, fim)
);

-- ---------- 2) Permissões ----------
create or replace function public.can_editar_paineis(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'criacao'])
$$;
revoke execute on function public.can_editar_paineis(uuid) from public, anon;
grant execute on function public.can_editar_paineis(uuid) to authenticated;

alter table public.paineis enable row level security;
alter table public.painel_vinhetas enable row level security;
alter table public.painel_historico enable row level security;
alter table public.painel_avisos_dados enable row level security;

revoke all on public.paineis, public.painel_vinhetas, public.painel_historico,
  public.painel_avisos_dados from public, anon, authenticated;

grant select on public.paineis to authenticated;
grant update (nome, espacos, duracao_padrao, loop_padrao, insercoes_padrao) on public.paineis to authenticated;
grant select on public.painel_vinhetas to authenticated;
grant insert (painel_id, posicao, cliente, ci, tipo, inicio, fim, representante_nome,
              duracao_seg, loop, insercoes_dia, observacao)
  on public.painel_vinhetas to authenticated;
grant update (posicao, cliente, ci, tipo, inicio, fim, representante_nome,
              duracao_seg, loop, insercoes_dia, observacao, retirada_em)
  on public.painel_vinhetas to authenticated;
grant select on public.painel_historico to authenticated;

drop policy if exists "paineis_ver" on public.paineis;
create policy "paineis_ver" on public.paineis
  for select to authenticated using (public.is_team_member(auth.uid()));
drop policy if exists "paineis_gestao_edita" on public.paineis;
create policy "paineis_gestao_edita" on public.paineis
  for update to authenticated
  using (public.has_role(auth.uid(), 'gestor'))
  with check (public.has_role(auth.uid(), 'gestor'));

drop policy if exists "vinhetas_ver" on public.painel_vinhetas;
create policy "vinhetas_ver" on public.painel_vinhetas
  for select to authenticated using (public.is_team_member(auth.uid()));
drop policy if exists "vinhetas_criar" on public.painel_vinhetas;
create policy "vinhetas_criar" on public.painel_vinhetas
  for insert to authenticated with check (public.can_editar_paineis(auth.uid()));
drop policy if exists "vinhetas_editar" on public.painel_vinhetas;
create policy "vinhetas_editar" on public.painel_vinhetas
  for update to authenticated
  using (public.can_editar_paineis(auth.uid()) and retirada_em is null)
  with check (public.can_editar_paineis(auth.uid()));

drop policy if exists "historico_ver" on public.painel_historico;
create policy "historico_ver" on public.painel_historico
  for select to authenticated using (public.is_team_member(auth.uid()));

-- ---------- Regras de gravação ----------
-- Liga o representante à pessoa da equipe pelo nome ("Laila" -> "Laila Souza").
create or replace function public.pessoa_pelo_nome(_nome text)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
   where length(trim(coalesce(_nome, ''))) > 0
     and (lower(trim(p.display_name)) = lower(trim(_nome))
          or lower(split_part(trim(p.display_name), ' ', 1)) = lower(trim(_nome)))
   order by (lower(trim(p.display_name)) = lower(trim(_nome))) desc, p.created_at
   limit 1
$$;
revoke execute on function public.pessoa_pelo_nome(text) from public, anon, authenticated;

create or replace function public.guard_painel_vinhetas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_espacos integer;
  v_nome text := coalesce(nullif(public.current_display_name(), ''),
                          case when auth.uid() is null then 'Importação da planilha' else 'Alguém da equipe' end);
begin
  select espacos into v_espacos from public.paineis where id = new.painel_id;
  if v_espacos is null then
    raise exception 'Painel não encontrado.' using errcode = '23503';
  end if;
  if new.posicao < 1 or new.posicao > v_espacos then
    raise exception 'Este painel tem % espaços: escolha um número de 1 a %.', v_espacos, v_espacos
      using errcode = '23514';
  end if;

  new.cliente := trim(new.cliente);
  new.ci := trim(new.ci);
  new.representante_nome := trim(new.representante_nome);
  new.representante_id := public.pessoa_pelo_nome(new.representante_nome);
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_nome := v_nome;

  if tg_op = 'INSERT' then
    new.retirada_em := null;
    new.retirada_por_nome := '';
    new.created_by := auth.uid();
    new.created_by_nome := v_nome;
    new.created_at := now();
  else
    -- Não troca de painel nem reescreve autoria.
    new.painel_id := old.painel_id;
    new.created_by := old.created_by;
    new.created_by_nome := old.created_by_nome;
    new.created_at := old.created_at;
    if old.retirada_em is not null then
      raise exception 'Esta vinheta já foi retirada do painel.' using errcode = '42501';
    end if;
    if new.retirada_em is not null then
      new.retirada_em := now();
      new.retirada_por_nome := v_nome;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_painel_vinhetas() from public, anon, authenticated;

drop trigger if exists painel_vinhetas_guard on public.painel_vinhetas;
create trigger painel_vinhetas_guard
  before insert or update on public.painel_vinhetas
  for each row execute function public.guard_painel_vinhetas();

-- ---------- 3) Histórico ----------
create or replace function public.log_painel_vinhetas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mudancas jsonb := '{}'::jsonb;
  v_campo text;
  v_de jsonb;
  v_para jsonb;
  v_acao text;
begin
  if tg_op = 'INSERT' then
    v_acao := case when auth.uid() is null then 'importada' else 'criada' end;
  elsif old.retirada_em is null and new.retirada_em is not null then
    v_acao := 'retirada';
  else
    v_acao := 'alterada';
    foreach v_campo in array array['posicao', 'cliente', 'ci', 'tipo', 'inicio', 'fim',
      'representante_nome', 'duracao_seg', 'loop', 'insercoes_dia', 'observacao'] loop
      v_de := to_jsonb(old) -> v_campo;
      v_para := to_jsonb(new) -> v_campo;
      if v_de is distinct from v_para then
        v_mudancas := v_mudancas || jsonb_build_object(v_campo, jsonb_build_object('de', v_de, 'para', v_para));
      end if;
    end loop;
    if v_mudancas = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.painel_historico (painel_id, vinheta_id, acao, cliente, posicao, mudancas, feito_por, feito_por_nome)
  values (new.painel_id, new.id, v_acao, new.cliente, new.posicao, v_mudancas, auth.uid(), new.updated_by_nome);
  return new;
end $$;
revoke execute on function public.log_painel_vinhetas() from public, anon, authenticated;

drop trigger if exists painel_vinhetas_log on public.painel_vinhetas;
create trigger painel_vinhetas_log
  after insert or update on public.painel_vinhetas
  for each row execute function public.log_painel_vinhetas();

drop trigger if exists paineis_touch on public.paineis;
create trigger paineis_touch before update on public.paineis
  for each row execute function public.touch_updated_at();

-- ---------- 4) Avisos de vencimento ----------
alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                  'liberacao_reprovada', 'liberacao_aprovada',
                  'briefing_novo', 'briefing_andamento', 'briefing_concluido',
                  'visita_nova', 'visita_agendada', 'visita_realizada', 'visita_cancelada',
                  'rgb_vencendo', 'rgb_vence_hoje', 'rgb_vencida'));

-- Gera os avisos pendentes. Pode rodar quantas vezes quiser: cada etapa avisa uma vez só.
-- Destino: o representante; evento, ou representante que não está na equipe, vai para a Gestão.
-- Mesmo cliente + CI em vários painéis vira um aviso só, listando os painéis.
create or replace function public.gerar_avisos_paineis()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total integer := 0;
  g record;
begin
  if auth.uid() is not null and not public.is_team_member(auth.uid()) then
    return 0;
  end if;

  for g in
    with pendentes as (
      select v.*,
             case when v.fim < v_hoje then 'vencida'
                  when v.fim = v_hoje then 'hoje'
                  else 'vencendo' end as etapa,
             p.codigo || case when p.nome <> '' then ' - ' || p.nome else '' end as painel_txt,
             p.ordem
        from public.painel_vinhetas v
        join public.paineis p on p.id = v.painel_id
       where v.retirada_em is null
         and v.tipo <> 'indisponivel'
         and v.fim is not null
         and v.fim <= v_hoje + 7
         and not exists (
           select 1 from public.painel_avisos_dados a
            where a.vinheta_id = v.id and a.fim = v.fim
              and a.etapa = case when v.fim < v_hoje then 'vencida'
                                 when v.fim = v_hoje then 'hoje' else 'vencendo' end)
    ), marcados as (
      insert into public.painel_avisos_dados (vinheta_id, etapa, fim)
      select id, etapa, fim from pendentes
      on conflict do nothing
    )
    select lower(regexp_replace(cliente, '\s+', '', 'g')) || '|' || lower(ci) || '|' || etapa || '|' || fim as chave,
           min(cliente) as cliente, min(ci) as ci, etapa, fim,
           bool_or(tipo = 'evento') as evento,
           (array_agg(representante_id))[1] as representante_id,
           min(representante_nome) as representante_nome,
           string_agg(painel_txt, ' / ' order by ordem) as paineis
      from pendentes
     group by 1, etapa, fim
  loop
    insert into public.notifications (recipient_id, tipo, link, actor_name, project_name, detalhe)
    select distinct d,
           case g.etapa when 'vencida' then 'rgb_vencida' when 'hoje' then 'rgb_vence_hoje' else 'rgb_vencendo' end,
           '/paineis',
           'Controle RGB',
           g.cliente,
           g.paineis
             || ' · fim ' || to_char(g.fim, 'DD/MM/YYYY')
             || case when g.etapa = 'vencendo' then ' (faltam ' || (g.fim - v_hoje)
                  || case when g.fim - v_hoje = 1 then ' dia)' else ' dias)' end else '' end
             || case when g.ci <> '' then ' · CI ' || g.ci else '' end
             || case when g.representante_nome <> '' then ' · ' || g.representante_nome else '' end
      from unnest(
             case when not g.evento and g.representante_id is not null
                  then array[g.representante_id]
                  else array(select distinct user_id from public.user_roles where role = 'gestor') end) as d
     where d is not null;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
revoke execute on function public.gerar_avisos_paineis() from public, anon;
grant execute on function public.gerar_avisos_paineis() to authenticated, service_role;

-- Roda todo dia às 7h (Brasília) quando o pg_cron estiver ligado no Supabase.
-- Sem ele, os avisos saem quando alguém da equipe abre o app (o app chama a função).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'avisos-paineis-rgb';
  perform cron.schedule('avisos-paineis-rgb', '0 10 * * *', 'select public.gerar_avisos_paineis()');
exception when others then
  raise notice 'pg_cron indisponível (%): os avisos saem quando alguém abre o app.', sqlerrm;
end $$;

-- ---------- Painéis ----------
insert into public.paineis (codigo, nome, espacos, insercoes_padrao, ordem) values
  ('RGB 1', 'Painel Shopping', 22, 300, 1),
  ('RGB 2', 'Painel Canaã', 22, 300, 2),
  ('RGB 3', 'Painel Timóteo', 22, 300, 3),
  ('RGB 4', 'Painel Fabriciano', 22, 300, 4),
  ('RGB 5', 'Painel Vila Ipanema', 22, 300, 5),
  ('RGB 6', 'Painel Iguaçu', 22, 300, 6),
  ('RGB 7', 'Painel Ipaminas', 22, 300, 7),
  ('PA01', 'Painel Praça Shopping', 17, 250, 8)
on conflict (codigo) do nothing;
