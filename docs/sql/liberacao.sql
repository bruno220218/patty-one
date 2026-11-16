-- Liberações + fluxo de aprovação + funções da equipe.
--
-- Fluxo: Orçamento → Liberação (comercial) → fila do PCP → aprovada (vira projeto) ou
-- reprovada (volta para edição; ao reenviar vai para o fim da fila).
--
-- Funções (user_roles.role):
--   gestor    = Gestão (tudo)
--   comercial = cria e edita liberações
--   pcp, direcao = aprovam / reprovam liberações
--   criacao, producao, montagem = executam os projetos
--   membro    = acesso básico (toda pessoa aprovada tem)

-- 1) Novas funções
alter type public.app_role add value if not exists 'comercial';
alter type public.app_role add value if not exists 'pcp';
alter type public.app_role add value if not exists 'direcao';
alter type public.app_role add value if not exists 'criacao';
alter type public.app_role add value if not exists 'producao';
alter type public.app_role add value if not exists 'montagem';

-- (usam role::text para funcionar na mesma transação do "add value")
create or replace function public.has_any_role(_user_id uuid, _roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role::text = any (_roles)
  )
$$;

create or replace function public.can_edit_liberacoes(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial'])
$$;

create or replace function public.can_aprovar_liberacoes(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'pcp', 'direcao'])
$$;

revoke execute on function public.has_any_role(uuid, text[]) from public, anon;
revoke execute on function public.can_edit_liberacoes(uuid) from public, anon;
revoke execute on function public.can_aprovar_liberacoes(uuid) from public, anon;
grant execute on function public.has_any_role(uuid, text[]) to authenticated, service_role;
grant execute on function public.can_edit_liberacoes(uuid) to authenticated, service_role;
grant execute on function public.can_aprovar_liberacoes(uuid) to authenticated, service_role;

-- 2) Cabeçalho da liberação
create sequence if not exists public.liberacoes_numero_seq start 1;

create table if not exists public.liberacoes (
  id uuid primary key default gen_random_uuid(),
  modelo text not null check (modelo in ('projeto', 'midia')),
  numero integer not null unique default nextval('public.liberacoes_numero_seq'),
  cliente text not null default '',
  responsavel text not null default '',
  contato text not null default '',
  endereco text not null default '',
  projetista text not null default '',
  vendedor text not null default '',
  classificacao_venda text not null default '',
  data_liberacao date,
  data_entrega date,
  bissemana text not null default '',
  ponto_energia text not null default '',
  horario_instalacao text not null default '',
  observacoes text not null default '',
  -- Fluxo
  status text not null default 'aguardando'
    check (status in ('aguardando', 'reprovada', 'aprovada')),
  enviada_em timestamptz not null default now(),          -- posição na fila do PCP
  motivo_reprovacao text not null default '',
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_por_nome text not null default '',
  decidido_em timestamptz,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.liberacoes_numero_seq owned by public.liberacoes.numero;
create index if not exists liberacoes_fila_idx on public.liberacoes (status, enviada_em);

create trigger liberacoes_touch before update on public.liberacoes
  for each row execute function public.touch_updated_at();

-- 3) Itens (Nº PAINEL/ORÇAMENTO | SERVIÇO | INSUMOS/MÍDIA | ACABAMENTO | INSTALAÇÃO |
--            DETALHES | LARGURA | ALTURA | QTDA | LOCAL DE INSTALAÇÃO)
create table if not exists public.liberacao_itens (
  id uuid primary key default gen_random_uuid(),
  liberacao_id uuid not null references public.liberacoes(id) on delete cascade,
  position integer not null default 0,
  referencia text not null default '',
  servico text not null default '',
  insumos text not null default '',
  acabamento text not null default '',
  instalacao text not null default '',
  detalhes text not null default '',
  largura_cm numeric(10, 2),
  altura_cm numeric(10, 2),
  quantidade numeric(10, 2),
  local_instalacao text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists liberacao_itens_liberacao_idx
  on public.liberacao_itens (liberacao_id, position);

-- 4) Histórico (criada, reprovada, reenviada, aprovada)
create table if not exists public.liberacao_eventos (
  id uuid primary key default gen_random_uuid(),
  liberacao_id uuid not null references public.liberacoes(id) on delete cascade,
  tipo text not null check (tipo in ('criada', 'reprovada', 'reenviada', 'aprovada')),
  detalhe text not null default '',
  autor uuid references auth.users(id) on delete set null default auth.uid(),
  autor_nome text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists liberacao_eventos_idx on public.liberacao_eventos (liberacao_id, created_at);

create or replace function public.current_display_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()), '')
$$;

-- 5) Regras do fluxo (não dependem da tela)
create or replace function public.guard_liberacoes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _editor boolean := public.can_edit_liberacoes(auth.uid());
  _aprovador boolean := public.can_aprovar_liberacoes(auth.uid());
  _decidindo boolean;
begin
  if tg_op = 'INSERT' then
    if not _editor then raise exception 'Somente comercial ou gestão criam liberações.'; end if;
    new.status := 'aguardando';
    new.enviada_em := now();
    new.motivo_reprovacao := '';
    new.decidido_por := null;
    new.decidido_por_nome := '';
    new.decidido_em := null;
    new.project_id := null;
    return new;
  end if;

  _decidindo := new.status is distinct from old.status;

  if _decidindo then
    -- Aprovar / reprovar: só PCP, direção ou gestão, e só quem está na fila.
    if new.status in ('aprovada', 'reprovada') then
      if not _aprovador then
        raise exception 'Somente PCP, direção ou gestão aprovam ou reprovam liberações.';
      end if;
      if old.status <> 'aguardando' then
        raise exception 'Esta liberação não está aguardando aprovação.';
      end if;
      if new.status = 'reprovada' and coalesce(trim(new.motivo_reprovacao), '') = '' then
        raise exception 'Informe o motivo da reprovação.';
      end if;
      if new.status = 'aprovada' then new.motivo_reprovacao := ''; end if;
      if not _editor then
        -- Aprovador sem função comercial não altera o conteúdo.
        new.modelo := old.modelo; new.numero := old.numero; new.cliente := old.cliente;
        new.responsavel := old.responsavel; new.contato := old.contato;
        new.endereco := old.endereco; new.projetista := old.projetista;
        new.vendedor := old.vendedor; new.classificacao_venda := old.classificacao_venda;
        new.data_liberacao := old.data_liberacao; new.data_entrega := old.data_entrega;
        new.bissemana := old.bissemana; new.ponto_energia := old.ponto_energia;
        new.horario_instalacao := old.horario_instalacao; new.observacoes := old.observacoes;
      end if;
      new.decidido_por := auth.uid();
      new.decidido_por_nome := public.current_display_name();
      new.decidido_em := now();
      new.enviada_em := old.enviada_em;
      if new.status = 'reprovada' then new.project_id := null; end if;
      insert into public.liberacao_eventos (liberacao_id, tipo, detalhe, autor_nome)
      values (new.id, new.status,
              case when new.status = 'reprovada' then trim(new.motivo_reprovacao) else '' end,
              public.current_display_name());
      return new;
    end if;
    raise exception 'Mudança de situação não permitida.';
  end if;

  -- Edição do conteúdo
  if not _editor then
    -- Aprovador pode vincular o projeto depois de aprovar; nada mais.
    if _aprovador and old.status = 'aprovada' then
      new := old_with_project(old, new.project_id);
      return new;
    end if;
    raise exception 'Somente comercial ou gestão editam liberações.';
  end if;
  if old.status = 'aprovada' and not public.has_any_role(auth.uid(), array['gestor']) then
    if new.project_id is distinct from old.project_id and _aprovador then
      return new;
    end if;
    raise exception 'Liberação aprovada não pode mais ser editada.';
  end if;

  -- Campos do fluxo não mudam por edição
  new.decidido_por := old.decidido_por;
  new.decidido_por_nome := old.decidido_por_nome;
  new.decidido_em := old.decidido_em;
  if not _aprovador then new.project_id := old.project_id; end if;

  if old.status = 'reprovada' then
    -- Corrigida: volta para a fila, no fim.
    new.status := 'aguardando';
    new.enviada_em := now();
    insert into public.liberacao_eventos (liberacao_id, tipo, detalhe, autor_nome)
    values (new.id, 'reenviada', '', public.current_display_name());
  else
    new.status := old.status;
    new.enviada_em := old.enviada_em;
    new.motivo_reprovacao := old.motivo_reprovacao;
  end if;
  return new;
end;
$$;

-- Helper: copia a linha antiga trocando só o project_id.
create or replace function public.old_with_project(_old public.liberacoes, _project uuid)
returns public.liberacoes language plpgsql immutable as $$
begin
  _old.project_id := _project;
  return _old;
end;
$$;

create trigger liberacoes_guard before insert or update on public.liberacoes
  for each row execute function public.guard_liberacoes();

create or replace function public.log_liberacao_criada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.liberacao_eventos (liberacao_id, tipo, autor_nome)
  values (new.id, 'criada', public.current_display_name());
  return new;
end;
$$;
create trigger liberacoes_log_criada after insert on public.liberacoes
  for each row execute function public.log_liberacao_criada();

-- Itens só mudam enquanto a liberação não foi aprovada (gestão pode sempre).
create or replace function public.liberacao_editavel(_liberacao_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_liberacoes(auth.uid()) and (
    public.has_any_role(auth.uid(), array['gestor'])
    or exists (select 1 from public.liberacoes where id = _liberacao_id and status <> 'aprovada')
  )
$$;

revoke execute on function public.guard_liberacoes() from public, anon, authenticated;
revoke execute on function public.log_liberacao_criada() from public, anon, authenticated;
revoke execute on function public.current_display_name() from public, anon;
revoke execute on function public.liberacao_editavel(uuid) from public, anon;
grant execute on function public.current_display_name() to authenticated, service_role;
grant execute on function public.liberacao_editavel(uuid) to authenticated, service_role;

-- 6) Permissões
alter table public.liberacoes enable row level security;
alter table public.liberacao_itens enable row level security;
alter table public.liberacao_eventos enable row level security;

revoke all on public.liberacoes, public.liberacao_itens, public.liberacao_eventos from anon;
grant select, insert, update, delete on public.liberacoes, public.liberacao_itens to authenticated;
grant select on public.liberacao_eventos to authenticated;
grant usage, select on sequence public.liberacoes_numero_seq to authenticated;
grant all on public.liberacoes, public.liberacao_itens, public.liberacao_eventos to service_role;

create policy "Equipe lê liberações" on public.liberacoes
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Comercial/gestão criam liberações" on public.liberacoes
  for insert to authenticated with check (public.can_edit_liberacoes(auth.uid()));
create policy "Comercial, PCP, direção e gestão atualizam liberações" on public.liberacoes
  for update to authenticated
  using (public.can_edit_liberacoes(auth.uid()) or public.can_aprovar_liberacoes(auth.uid()))
  with check (public.can_edit_liberacoes(auth.uid()) or public.can_aprovar_liberacoes(auth.uid()));
create policy "Comercial/gestão excluem liberações não aprovadas" on public.liberacoes
  for delete to authenticated using (
    public.can_edit_liberacoes(auth.uid())
    and (status <> 'aprovada' or public.has_any_role(auth.uid(), array['gestor']))
  );

create policy "Equipe lê itens de liberação" on public.liberacao_itens
  for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Itens editáveis: criar" on public.liberacao_itens
  for insert to authenticated with check (public.liberacao_editavel(liberacao_id));
create policy "Itens editáveis: alterar" on public.liberacao_itens
  for update to authenticated
  using (public.liberacao_editavel(liberacao_id))
  with check (public.liberacao_editavel(liberacao_id));
create policy "Itens editáveis: excluir" on public.liberacao_itens
  for delete to authenticated using (public.liberacao_editavel(liberacao_id));

create policy "Equipe lê histórico das liberações" on public.liberacao_eventos
  for select to authenticated using (public.is_team_member(auth.uid()));
