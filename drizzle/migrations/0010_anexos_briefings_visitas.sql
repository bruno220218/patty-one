-- ============ Anexos, Briefings e Visitas técnicas ============
-- 1) Função "Projetos especiais"
-- 2) Anexos por link (Google Drive) em liberações, briefings e visitas
-- 3) Briefings: comercial cria -> criação ou projetos especiais atendem
-- 4) Visitas técnicas: comercial solicita -> PCP agenda -> montagem realiza (com fotos)
-- 5) Avisos no sino e Lixeira para briefings e visitas

-- ---------- 1) Função ----------
alter type public.app_role add value if not exists 'projetos_especiais';

-- ---------- Avisos: novos tipos e link genérico ----------
alter table public.notifications add column if not exists link text not null default '';
alter table public.notifications add column if not exists ref_numero integer;
alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                  'liberacao_reprovada', 'liberacao_aprovada',
                  'briefing_novo', 'briefing_andamento', 'briefing_concluido',
                  'visita_nova', 'visita_agendada', 'visita_realizada', 'visita_cancelada'));

-- Envia um aviso para várias pessoas (nunca para quem fez a ação).
create or replace function public.avisar(
  _destinos uuid[], _tipo text, _link text, _numero integer, _cliente text, _detalhe text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, tipo, link, ref_numero, actor_name, project_name, detalhe)
  select distinct d, _tipo, _link, _numero, public.current_display_name(), coalesce(_cliente, ''), coalesce(_detalhe, '')
    from unnest(_destinos) as d
   where d is not null and d is distinct from auth.uid();
end $$;
revoke execute on function public.avisar(uuid[], text, text, integer, text, text) from public, anon, authenticated;

-- Pessoas com alguma das funções (gestão entra quando ninguém tem a função).
create or replace function public.pessoas_com_funcao(_roles text[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(array(select distinct user_id from public.user_roles where role::text = any (_roles)), '{}'),
    array(select distinct user_id from public.user_roles where role::text = 'gestor'))
$$;
revoke execute on function public.pessoas_com_funcao(text[]) from public, anon, authenticated;

-- ---------- 2) Anexos (Google Drive) ----------
-- Os arquivos ficam no Drive da empresa (enviados pelo app ou colados como link);
-- aqui guardamos só o link.
create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('liberacao', 'briefing', 'visita')),
  entidade_id uuid not null,
  url text not null check (url ~* '^https?://[^[:space:]]+$' and length(url) <= 2000),
  nome text not null check (length(trim(nome)) > 0 and length(nome) <= 200),
  tipo text not null default 'outro' check (tipo in ('pdf', 'foto', 'video', 'audio', 'outro')),
  drive_id text not null default '',        -- quando foi enviado pelo app direto para o Drive
  tamanho bigint,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_nome text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists anexos_entidade_idx on public.anexos (entidade, entidade_id, created_at);

alter table public.anexos enable row level security;
revoke all on public.anexos from public, anon, authenticated;
grant select, insert, delete on public.anexos to authenticated;
grant all on public.anexos to service_role;

drop policy if exists "Equipe lê anexos" on public.anexos;
create policy "Equipe lê anexos" on public.anexos
  for select to authenticated using (public.is_team_member(auth.uid()));
drop policy if exists "Equipe registra anexos" on public.anexos;
create policy "Equipe registra anexos" on public.anexos
  for insert to authenticated with check (public.is_team_member(auth.uid()));
drop policy if exists "Quem enviou ou gestão remove anexos" on public.anexos;
create policy "Quem enviou ou gestão remove anexos" on public.anexos
  for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'gestor'));

create or replace function public.anexos_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_by_nome := public.current_display_name();
  return new;
end $$;
revoke execute on function public.anexos_carimbo() from public, anon, authenticated;
drop trigger if exists anexos_carimbo on public.anexos;
create trigger anexos_carimbo before insert on public.anexos
  for each row execute function public.anexos_carimbo();

-- ---------- 3) Briefings ----------
create sequence if not exists public.briefings_numero_seq start 1;

create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('public.briefings_numero_seq'),
  destino text not null check (destino in ('criacao', 'projetos_especiais')),
  cliente text not null default '',
  contato text not null default '',
  vendedor text not null default '',
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text not null default '',     -- o que precisa ser feito
  objetivo text not null default '',      -- mensagem / objetivo
  publico text not null default '',       -- público e local de uso
  formatos text not null default '',      -- medidas, formatos, quantidades
  identidade text not null default '',    -- cores, logo, identidade visual
  referencias text not null default '',
  observacoes text not null default '',
  prazo date,
  status text not null default 'novo' check (status in ('novo', 'em_andamento', 'concluido')),
  responsavel_id uuid references auth.users(id) on delete set null,
  responsavel_nome text not null default '',
  concluido_em timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_nome text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.briefings_numero_seq owned by public.briefings.numero;

create or replace function public.can_criar_briefing(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial'])
$$;
create or replace function public.can_atender_briefing(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'criacao', 'projetos_especiais'])
$$;
revoke execute on function public.can_criar_briefing(uuid) from public, anon;
revoke execute on function public.can_atender_briefing(uuid) from public, anon;
grant execute on function public.can_criar_briefing(uuid) to authenticated, service_role;
grant execute on function public.can_atender_briefing(uuid) to authenticated, service_role;

create or replace function public.guard_briefings()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _editor boolean := public.can_criar_briefing(auth.uid());
  _atende boolean := public.can_atender_briefing(auth.uid());
  _gestor boolean := public.has_role(auth.uid(), 'gestor');
begin
  if tg_op = 'INSERT' then
    if not _editor then raise exception 'Somente comercial ou gestão criam briefings.'; end if;
    new.status := 'novo';
    new.responsavel_id := null;
    new.responsavel_nome := '';
    new.concluido_em := null;
    new.created_by := auth.uid();
    new.created_by_nome := public.current_display_name();
    return new;
  end if;

  new.numero := old.numero;
  new.created_by := old.created_by;
  new.created_by_nome := old.created_by_nome;
  new.created_at := old.created_at;

  -- Conteúdo: comercial/gestão, enquanto não concluído (gestão sempre).
  if (new.destino, new.cliente, new.contato, new.vendedor, new.titulo, new.descricao, new.objetivo,
      new.publico, new.formatos, new.identidade, new.referencias, new.observacoes, new.prazo)
     is distinct from
     (old.destino, old.cliente, old.contato, old.vendedor, old.titulo, old.descricao, old.objetivo,
      old.publico, old.formatos, old.identidade, old.referencias, old.observacoes, old.prazo) then
    if not _editor then raise exception 'Somente comercial ou gestão editam o briefing.'; end if;
    if old.status = 'concluido' and not _gestor then
      raise exception 'Este briefing já foi concluído.';
    end if;
  end if;

  -- Andamento: criação / projetos especiais / gestão.
  if new.status is distinct from old.status or new.responsavel_id is distinct from old.responsavel_id then
    if not _atende then
      raise exception 'Somente criação, projetos especiais ou gestão mudam o andamento.';
    end if;
    if new.responsavel_id is distinct from old.responsavel_id then
      new.responsavel_nome := coalesce(
        (select display_name from public.profiles where id = new.responsavel_id), '');
    end if;
    if new.status = 'em_andamento' and new.responsavel_id is null then
      new.responsavel_id := auth.uid();
      new.responsavel_nome := public.current_display_name();
    end if;
    new.concluido_em := case when new.status = 'concluido' then coalesce(old.concluido_em, now()) end;
  else
    new.responsavel_nome := old.responsavel_nome;
    new.concluido_em := old.concluido_em;
  end if;

  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_briefings() from public, anon, authenticated;
drop trigger if exists briefings_guard on public.briefings;
create trigger briefings_guard before insert or update on public.briefings
  for each row execute function public.guard_briefings();

create or replace function public.notify_briefings()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _link text := '/briefings/' || new.id;
begin
  if current_setting('app.restaurando', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    perform public.avisar(public.pessoas_com_funcao(array[new.destino]), 'briefing_novo', _link,
                          new.numero, new.cliente, new.titulo);
  elsif new.status is distinct from old.status and new.status in ('em_andamento', 'concluido') then
    perform public.avisar(array[new.created_by],
                          case new.status when 'concluido' then 'briefing_concluido' else 'briefing_andamento' end,
                          _link, new.numero, new.cliente, new.titulo);
  end if;
  return new;
end $$;
revoke execute on function public.notify_briefings() from public, anon, authenticated;
drop trigger if exists briefings_notify on public.briefings;
create trigger briefings_notify after insert or update on public.briefings
  for each row execute function public.notify_briefings();

alter table public.briefings enable row level security;
revoke all on public.briefings from public, anon, authenticated;
grant select, insert, update, delete on public.briefings to authenticated;
grant all on public.briefings to service_role;
grant usage on sequence public.briefings_numero_seq to authenticated;

drop policy if exists "Equipe lê briefings" on public.briefings;
create policy "Equipe lê briefings" on public.briefings
  for select to authenticated using (public.is_team_member(auth.uid()));
drop policy if exists "Comercial cria briefings" on public.briefings;
create policy "Comercial cria briefings" on public.briefings
  for insert to authenticated with check (public.can_criar_briefing(auth.uid()));
drop policy if exists "Comercial e atendentes atualizam briefings" on public.briefings;
create policy "Comercial e atendentes atualizam briefings" on public.briefings
  for update to authenticated
  using (public.can_criar_briefing(auth.uid()) or public.can_atender_briefing(auth.uid()))
  with check (public.can_criar_briefing(auth.uid()) or public.can_atender_briefing(auth.uid()));
drop policy if exists "Quem criou ou gestão apaga briefings" on public.briefings;
create policy "Quem criou ou gestão apaga briefings" on public.briefings
  for delete to authenticated
  using (public.has_role(auth.uid(), 'gestor')
         or (created_by = auth.uid() and status <> 'concluido'));

-- ---------- 4) Visitas técnicas ----------
create sequence if not exists public.visitas_numero_seq start 1;

create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('public.visitas_numero_seq'),
  -- Solicitação (comercial)
  cliente text not null check (length(trim(cliente)) > 0),
  contato text not null default '',        -- contato / telefone
  endereco text not null default '',
  referencia_local text not null default '',
  vendedor text not null default '',
  data_sugerida date,
  descricao text not null default '',      -- medidas a serem realizadas
  -- Agendamento (PCP)
  status text not null default 'solicitada'
    check (status in ('solicitada', 'agendada', 'realizada', 'cancelada')),
  agendada_para timestamptz,
  responsavel_id uuid references auth.users(id) on delete set null,
  responsavel_nome text not null default '',
  agendado_por_nome text not null default '',
  -- Realização (montagem): o formulário da visita
  vistoria jsonb not null default '{}'::jsonb,
  realizada_em timestamptz,
  realizada_por_nome text not null default '',
  motivo_cancelamento text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_nome text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.visitas_numero_seq owned by public.visitas.numero;

create or replace function public.can_solicitar_visita(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial'])
$$;
create or replace function public.can_agendar_visita(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'pcp'])
$$;
create or replace function public.can_realizar_visita(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'pcp', 'montagem'])
$$;
revoke execute on function public.can_solicitar_visita(uuid) from public, anon;
revoke execute on function public.can_agendar_visita(uuid) from public, anon;
revoke execute on function public.can_realizar_visita(uuid) from public, anon;
grant execute on function public.can_solicitar_visita(uuid) to authenticated, service_role;
grant execute on function public.can_agendar_visita(uuid) to authenticated, service_role;
grant execute on function public.can_realizar_visita(uuid) to authenticated, service_role;

create or replace function public.guard_visitas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _solicita boolean := public.can_solicitar_visita(auth.uid());
  _agenda boolean := public.can_agendar_visita(auth.uid());
  _realiza boolean := public.can_realizar_visita(auth.uid());
  _gestor boolean := public.has_role(auth.uid(), 'gestor');
begin
  if tg_op = 'INSERT' then
    if not _solicita then raise exception 'Somente comercial ou gestão solicitam visitas.'; end if;
    new.status := 'solicitada';
    new.agendada_para := null;
    new.responsavel_id := null;
    new.responsavel_nome := '';
    new.agendado_por_nome := '';
    new.vistoria := '{}'::jsonb;
    new.realizada_em := null;
    new.realizada_por_nome := '';
    new.motivo_cancelamento := '';
    new.created_by := auth.uid();
    new.created_by_nome := public.current_display_name();
    return new;
  end if;

  new.numero := old.numero;
  new.created_by := old.created_by;
  new.created_by_nome := old.created_by_nome;
  new.created_at := old.created_at;

  -- Dados da solicitação: comercial/gestão (ou PCP), antes de realizada.
  if (new.cliente, new.contato, new.endereco, new.referencia_local, new.vendedor, new.data_sugerida, new.descricao)
     is distinct from
     (old.cliente, old.contato, old.endereco, old.referencia_local, old.vendedor, old.data_sugerida, old.descricao) then
    if not (_solicita or _agenda) then
      raise exception 'Somente comercial, PCP ou gestão editam a solicitação.';
    end if;
    if old.status in ('realizada', 'cancelada') and not _gestor then
      raise exception 'Esta visita já foi encerrada.';
    end if;
  end if;

  -- Agenda e responsável: PCP/gestão.
  if new.agendada_para is distinct from old.agendada_para
     or new.responsavel_id is distinct from old.responsavel_id then
    if not _agenda then raise exception 'Somente PCP ou gestão agendam visitas.'; end if;
    new.responsavel_nome := coalesce(
      (select display_name from public.profiles where id = new.responsavel_id), '');
    new.agendado_por_nome := public.current_display_name();
  else
    new.responsavel_nome := old.responsavel_nome;
    new.agendado_por_nome := old.agendado_por_nome;
  end if;

  -- Formulário da visita: montagem/PCP/gestão.
  if new.vistoria is distinct from old.vistoria then
    if not _realiza then raise exception 'Somente montagem, PCP ou gestão preenchem a visita.'; end if;
    if old.status = 'realizada' and not (_agenda) then
      raise exception 'Esta visita já foi concluída. Peça ao PCP para ajustar.';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'agendada' then
      if not _agenda then raise exception 'Somente PCP ou gestão agendam visitas.'; end if;
      if new.agendada_para is null or new.responsavel_id is null then
        raise exception 'Informe a data e quem vai fazer a visita.';
      end if;
    elsif new.status = 'realizada' then
      if not _realiza then raise exception 'Somente montagem, PCP ou gestão concluem visitas.'; end if;
      if old.status <> 'agendada' then raise exception 'A visita precisa estar agendada.'; end if;
      if not exists (select 1 from public.anexos a
                      where a.entidade = 'visita' and a.entidade_id = new.id and a.tipo = 'foto') then
        raise exception 'Fotografar os espaços é obrigatório: adicione o link das fotos.';
      end if;
      new.realizada_em := now();
      new.realizada_por_nome := public.current_display_name();
    elsif new.status = 'cancelada' then
      if not (_agenda or old.created_by = auth.uid()) then
        raise exception 'Somente o PCP, a gestão ou quem pediu cancelam a visita.';
      end if;
      if old.status = 'realizada' then raise exception 'Esta visita já foi realizada.'; end if;
      if coalesce(trim(new.motivo_cancelamento), '') = '' then
        raise exception 'Informe o motivo do cancelamento.';
      end if;
    elsif new.status = 'solicitada' then
      if not _agenda then raise exception 'Somente PCP ou gestão reabrem visitas.'; end if;
    end if;
  else
    new.realizada_em := old.realizada_em;
    new.realizada_por_nome := old.realizada_por_nome;
  end if;
  if new.status <> 'cancelada' then new.motivo_cancelamento := ''; end if;

  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_visitas() from public, anon, authenticated;
drop trigger if exists visitas_guard on public.visitas;
create trigger visitas_guard before insert or update on public.visitas
  for each row execute function public.guard_visitas();

create or replace function public.notify_visitas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _link text := '/visitas/' || new.id;
  _quando text := case when new.agendada_para is not null
    then to_char(new.agendada_para at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') else '' end;
begin
  if current_setting('app.restaurando', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    perform public.avisar(public.pessoas_com_funcao(array['pcp']), 'visita_nova', _link,
                          new.numero, new.cliente, new.endereco);
  elsif new.status is distinct from old.status
        or (new.status = 'agendada' and (new.agendada_para, new.responsavel_id)
            is distinct from (old.agendada_para, old.responsavel_id)) then
    if new.status = 'agendada' then
      perform public.avisar(array[new.responsavel_id, new.created_by], 'visita_agendada', _link,
                            new.numero, new.cliente, trim(_quando || ' · ' || new.responsavel_nome, ' ·'));
    elsif new.status = 'realizada' then
      perform public.avisar(array[new.created_by] || public.pessoas_com_funcao(array['pcp']),
                            'visita_realizada', _link, new.numero, new.cliente, new.realizada_por_nome);
    elsif new.status = 'cancelada' then
      perform public.avisar(array[new.created_by, new.responsavel_id], 'visita_cancelada', _link,
                            new.numero, new.cliente, new.motivo_cancelamento);
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.notify_visitas() from public, anon, authenticated;
drop trigger if exists visitas_notify on public.visitas;
create trigger visitas_notify after insert or update on public.visitas
  for each row execute function public.notify_visitas();

alter table public.visitas enable row level security;
revoke all on public.visitas from public, anon, authenticated;
grant select, insert, update, delete on public.visitas to authenticated;
grant all on public.visitas to service_role;
grant usage on sequence public.visitas_numero_seq to authenticated;

drop policy if exists "Equipe lê visitas" on public.visitas;
create policy "Equipe lê visitas" on public.visitas
  for select to authenticated using (public.is_team_member(auth.uid()));
drop policy if exists "Comercial solicita visitas" on public.visitas;
create policy "Comercial solicita visitas" on public.visitas
  for insert to authenticated with check (public.can_solicitar_visita(auth.uid()));
drop policy if exists "Envolvidos atualizam visitas" on public.visitas;
create policy "Envolvidos atualizam visitas" on public.visitas
  for update to authenticated
  using (public.can_solicitar_visita(auth.uid()) or public.can_realizar_visita(auth.uid()))
  with check (public.can_solicitar_visita(auth.uid()) or public.can_realizar_visita(auth.uid()));
drop policy if exists "Quem pediu ou gestão apaga visitas" on public.visitas;
create policy "Quem pediu ou gestão apaga visitas" on public.visitas
  for delete to authenticated
  using (public.has_role(auth.uid(), 'gestor')
         or (created_by = auth.uid() and status = 'solicitada'));

-- ---------- 5) Lixeira: briefings e visitas ----------
create or replace function public.lixeira_guardar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_principal boolean := pg_trigger_depth() = 1; -- 1 = a pessoa apagou; >1 = veio em cascata
  v_registro jsonb := to_jsonb(old);
  v_tipo text := '';
  v_rotulo text := '';
  v_detalhe text := '';
  v_nome text := '';
begin
  if current_setting('app.restaurando', true) = 'on' then
    return old;
  end if;
  if tg_table_name = 'liberacao_itens' and is_principal then
    return old;
  end if;

  if tg_table_name = 'projects' then
    v_tipo := 'Projeto';
    v_rotulo := old.name;
    v_registro := v_registro || jsonb_build_object('_liberacoes',
      coalesce((select jsonb_agg(l.id) from public.liberacoes l where l.project_id = old.id), '[]'::jsonb));
  elsif tg_table_name = 'project_tasks' then
    v_tipo := 'Tarefa';
    v_rotulo := old.title;
    select p.name into v_detalhe from public.projects p where p.id = old.project_id;
  elsif tg_table_name = 'project_blockers' then
    v_tipo := 'Bloqueio';
    v_rotulo := left(old.description, 120);
  elsif tg_table_name = 'liberacoes' then
    v_tipo := 'Liberação';
    v_rotulo := 'Liberação #' || old.numero || case when old.cliente <> '' then ' - ' || old.cliente else '' end;
    v_detalhe := case old.modelo when 'midia' then 'Mídia' else 'Projetos' end;
  elsif tg_table_name = 'liberacao_itens' then
    v_tipo := 'Item da liberação';
  elsif tg_table_name = 'liberacao_eventos' then
    v_tipo := 'Histórico da liberação';
  elsif tg_table_name = 'checklists' then
    v_tipo := 'Checklist';
    v_rotulo := old.name;
  elsif tg_table_name = 'checklist_tasks' then
    v_tipo := 'Tarefa do checklist';
    v_rotulo := old.title;
    select c.name into v_detalhe from public.checklists c where c.id = old.checklist_id;
  elsif tg_table_name = 'briefings' then
    v_tipo := 'Briefing';
    v_rotulo := 'Briefing #' || old.numero || ' - ' || old.titulo;
    v_detalhe := old.cliente;
  elsif tg_table_name = 'visitas' then
    v_tipo := 'Visita técnica';
    v_rotulo := 'Visita #' || old.numero || ' - ' || old.cliente;
    v_detalhe := old.endereco;
  end if;

  select coalesce(pr.display_name, '') into v_nome from public.profiles pr where pr.id = auth.uid();

  insert into public.lixeira (lote, tabela, registro, principal, tipo, rotulo, detalhe, apagado_por, apagado_por_nome)
  values (txid_current(), tg_table_name, v_registro, is_principal, v_tipo,
          coalesce(v_rotulo, ''), coalesce(v_detalhe, ''), auth.uid(), coalesce(v_nome, ''));

  if is_principal then
    delete from public.lixeira where apagado_em < now() - interval '30 days';
  end if;
  return old;
end $$;
revoke execute on function public.lixeira_guardar() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['briefings', 'visitas']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_lixeira', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.lixeira_guardar()',
                   t || '_lixeira', t);
  end loop;
end $$;

create or replace function public.restaurar_lixeira(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_dono uuid;
  v_ordem constant text[] := array['checklists','projects','liberacoes','briefings','visitas',
    'checklist_tasks','project_tasks','project_blockers','liberacao_itens','liberacao_eventos'];
begin
  select l.apagado_por into v_dono from public.lixeira l where l.lote = p_lote and l.principal limit 1;
  if not found then
    raise exception 'Item não encontrado na lixeira (pode ter passado de 30 dias).';
  end if;
  if not (public.has_role(auth.uid(), 'gestor') or v_dono = auth.uid()) then
    raise exception 'Somente gestores ou quem apagou podem restaurar este item.';
  end if;

  perform set_config('app.restaurando', 'on', true);
  perform set_config('session_replication_role', 'replica', true);

  for r in
    select l.* from public.lixeira l
    where l.lote = p_lote
    order by array_position(v_ordem, l.tabela), l.apagado_em
  loop
    if r.tabela <> all (v_ordem) then
      continue;
    end if;
    if r.tabela in ('project_tasks','project_blockers')
       and not exists (select 1 from public.projects p where p.id = (r.registro ->> 'project_id')::uuid) then
      raise exception 'O projeto desta tarefa foi apagado. Restaure o projeto primeiro.';
    elsif r.tabela = 'checklist_tasks'
       and not exists (select 1 from public.checklists c where c.id = (r.registro ->> 'checklist_id')::uuid) then
      raise exception 'O checklist desta tarefa foi apagado. Restaure o checklist primeiro.';
    elsif r.tabela in ('liberacao_itens','liberacao_eventos')
       and not exists (select 1 from public.liberacoes l where l.id = (r.registro ->> 'liberacao_id')::uuid) then
      raise exception 'A liberação deste item foi apagada. Restaure a liberação primeiro.';
    end if;
    execute format(
      'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do nothing',
      r.tabela) using (r.registro - '_liberacoes');

    if r.tabela = 'projects' and jsonb_typeof(r.registro -> '_liberacoes') = 'array' then
      update public.liberacoes set project_id = (r.registro ->> 'id')::uuid
      where project_id is null
        and id in (select (jsonb_array_elements_text(r.registro -> '_liberacoes'))::uuid);
    end if;
  end loop;

  perform set_config('session_replication_role', 'origin', true);
  perform set_config('app.restaurando', 'off', true);

  delete from public.lixeira where lote = p_lote;
end $$;
revoke execute on function public.restaurar_lixeira(bigint) from public, anon;
grant execute on function public.restaurar_lixeira(bigint) to authenticated;

-- ---------- Quem pode ser escolhido como responsável ----------
-- (user_roles só é visível para a gestão; esta função lista nomes para a equipe)
create or replace function public.pessoas_da_funcao(_roles text[])
returns table (id uuid, nome text) language sql stable security definer set search_path = public as $$
  select distinct p.id, coalesce(nullif(p.display_name, ''), 'Sem nome')
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
   where public.is_team_member(auth.uid()) and r.role::text = any (_roles)
   order by 2
$$;
revoke execute on function public.pessoas_da_funcao(text[]) from public, anon;
grant execute on function public.pessoas_da_funcao(text[]) to authenticated;
