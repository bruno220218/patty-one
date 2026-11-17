-- Automações do Patty One
--   1) Informações do cliente nos projetos
--   2) Notificações (tarefa concluída → Gestão e PCP; fluxo da liberação → PCP/Direção e quem criou)
--   3) Listas editáveis da liberação (serviços, insumos, acabamentos, instalação, projetistas, vendedores)
--
-- Depende da migração das liberações (funções, liberacoes, liberacao_eventos) já aplicada.

-- 1) Informações do cliente nos projetos
-- 2) Notificações para gestores quando uma tarefa de projeto é concluída

-- ---------------------------------------------------------------------------
-- 1) Informações do cliente
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists service_type  text not null default '',
  add column if not exists led_color     text not null default '',
  add column if not exists paint_colors  text not null default '',
  add column if not exists adhesive_type text not null default '',
  -- null = não informado
  add column if not exists lamination    boolean;

-- Projects use column-level grants (e.g. `locked` is not client-writable), so the
-- new columns must be granted explicitly. RLS on projects still decides who may update.
grant update (service_type, led_color, paint_colors, adhesive_type, lamination)
  on public.projects to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Notificações
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  task_id       uuid references public.project_tasks (id) on delete set null,
  -- Snapshots so the history survives renames and removals.
  actor_name    text not null default '',
  project_name  text not null default '',
  task_title    text not null default '',
  -- Tipo do aviso e dados da liberação (quando for o caso)
  tipo          text not null default 'tarefa_concluida'
    check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                    'liberacao_reprovada', 'liberacao_aprovada')),
  liberacao_id  uuid references public.liberacoes (id) on delete set null,
  liberacao_numero integer,
  detalhe       text not null default '',
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

-- Rows are created only by the trigger below; people can read their own and mark them read.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Avisa a Gestão e o PCP (menos quem marcou) quando uma tarefa de produção é concluída.
create or replace function public.notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor_name   text;
  _project_name text;
begin
  if old.completed_at is not null or new.completed_at is null then
    return new;
  end if;

  select coalesce(nullif(new.completed_by_name, ''), p.display_name, 'Alguém da equipe')
    into _actor_name
    from (select 1) as one
    left join public.profiles p on p.id = new.completed_by;

  select name into _project_name from public.projects where id = new.project_id;

  insert into public.notifications (recipient_id, project_id, task_id, actor_name, project_name, task_title)
  select distinct r.user_id, new.project_id, new.id, _actor_name, coalesce(_project_name, ''), new.title
    from public.user_roles r
   where r.role::text in ('gestor', 'pcp')
     and r.user_id is distinct from new.completed_by;

  return new;
end;
$$;

revoke all on function public.notify_task_completed() from public, anon, authenticated;

drop trigger if exists project_tasks_notify_completed on public.project_tasks;
create trigger project_tasks_notify_completed
  after update of completed_at on public.project_tasks
  for each row
  execute function public.notify_task_completed();

-- Live updates for the bell (Realtime respects the RLS policies above).
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Avisos do fluxo da liberação (a partir do histórico)
--    criada / reenviada → PCP e Direção (se não houver ninguém, Gestão)
--    reprovada / aprovada → quem criou a liberação (se não houver, Comercial)
--    Quem fez a ação não recebe o próprio aviso.
-- ---------------------------------------------------------------------------
create or replace function public.notify_liberacao_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _lib   public.liberacoes;
  _tipo  text;
  _actor uuid := new.autor;
begin
  select * into _lib from public.liberacoes where id = new.liberacao_id;
  if not found then return new; end if;

  _tipo := case new.tipo
    when 'criada' then 'liberacao_nova'
    when 'reenviada' then 'liberacao_reenviada'
    when 'reprovada' then 'liberacao_reprovada'
    when 'aprovada' then 'liberacao_aprovada'
  end;

  if new.tipo in ('criada', 'reenviada') then
    insert into public.notifications
      (recipient_id, tipo, liberacao_id, liberacao_numero, actor_name, project_name, detalhe)
    select distinct r.user_id, _tipo, _lib.id, _lib.numero, new.autor_nome, _lib.cliente, ''
      from public.user_roles r
     where r.user_id is distinct from _actor
       and (
         r.role::text in ('pcp', 'direcao')
         or (r.role::text = 'gestor'
             and not exists (select 1 from public.user_roles x where x.role::text in ('pcp', 'direcao')))
       );
  else
    insert into public.notifications
      (recipient_id, tipo, liberacao_id, liberacao_numero, actor_name, project_name, project_id, detalhe)
    select distinct u.user_id, _tipo, _lib.id, _lib.numero, new.autor_nome, _lib.cliente,
           _lib.project_id, new.detalhe
      from (
        select _lib.created_by as user_id where _lib.created_by is not null
        union
        select r.user_id from public.user_roles r
         where _lib.created_by is null and r.role::text = 'comercial'
      ) u
     where u.user_id is distinct from _actor;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_liberacao_evento() from public, anon, authenticated;

drop trigger if exists liberacao_eventos_notify on public.liberacao_eventos;
create trigger liberacao_eventos_notify
  after insert on public.liberacao_eventos
  for each row
  execute function public.notify_liberacao_evento();

-- O aviso de aprovação nasce antes da linha ser gravada; quando o projeto fica
-- vinculado, o aviso recebe o link dele.
create or replace function public.link_project_on_approval_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null and new.project_id is distinct from old.project_id then
    update public.notifications
       set project_id = new.project_id
     where liberacao_id = new.id
       and tipo = 'liberacao_aprovada'
       and project_id is null;
  end if;
  return new;
end;
$$;

revoke all on function public.link_project_on_approval_notice() from public, anon, authenticated;

drop trigger if exists liberacoes_link_project_notice on public.liberacoes;
create trigger liberacoes_link_project_notice
  after update of project_id on public.liberacoes
  for each row
  execute function public.link_project_on_approval_notice();

-- ---------------------------------------------------------------------------
-- 4) Listas editáveis da liberação
--    modelo: 'projeto', 'midia' ou 'todos' (projetista e vendedor valem para os dois)
-- ---------------------------------------------------------------------------
create table if not exists public.liberacao_opcoes (
  id         uuid primary key default gen_random_uuid(),
  modelo     text not null check (modelo in ('projeto', 'midia', 'todos')),
  campo      text not null check (campo in ('servico', 'insumos', 'acabamento', 'instalacao',
                                            'projetista', 'vendedor')),
  valor      text not null check (length(trim(valor)) > 0),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists liberacao_opcoes_unico
  on public.liberacao_opcoes (modelo, campo, lower(trim(valor)));
create index if not exists liberacao_opcoes_ordem
  on public.liberacao_opcoes (modelo, campo, position);

alter table public.liberacao_opcoes enable row level security;
revoke all on public.liberacao_opcoes from anon;
grant select, insert, update, delete on public.liberacao_opcoes to authenticated;
grant all on public.liberacao_opcoes to service_role;

drop policy if exists "Equipe lê opções" on public.liberacao_opcoes;
create policy "Equipe lê opções" on public.liberacao_opcoes
  for select to authenticated using (public.is_team_member(auth.uid()));
drop policy if exists "Gestão cria opções" on public.liberacao_opcoes;
create policy "Gestão cria opções" on public.liberacao_opcoes
  for insert to authenticated with check (public.has_any_role(auth.uid(), array['gestor']));
drop policy if exists "Gestão altera opções" on public.liberacao_opcoes;
create policy "Gestão altera opções" on public.liberacao_opcoes
  for update to authenticated
  using (public.has_any_role(auth.uid(), array['gestor']))
  with check (public.has_any_role(auth.uid(), array['gestor']));
drop policy if exists "Gestão exclui opções" on public.liberacao_opcoes;
create policy "Gestão exclui opções" on public.liberacao_opcoes
  for delete to authenticated using (public.has_any_role(auth.uid(), array['gestor']));

-- Listas atuais (as mesmas das planilhas, com os ajustes já feitos)
insert into public.liberacao_opcoes (modelo, campo, valor, position) values
  ('projeto', 'servico', 'ACM ADESIVADO', 0),
  ('projeto', 'servico', 'ACM COM LETRAS EM ACRILICO', 1),
  ('projeto', 'servico', 'ACM COM LETRAS EM PS', 2),
  ('projeto', 'servico', 'ACRILICO', 3),
  ('projeto', 'servico', 'ACRILICO ADESIVADO', 4),
  ('projeto', 'servico', 'ACRILICO COM ADESIVO IMPRESSO NO TRANSPARENTE LAMINADO COM BRANCO', 5),
  ('projeto', 'servico', 'ACRILICO COM CABO DE ACO', 6),
  ('projeto', 'servico', 'ACRILICO RETROADESIVADO EM ADESIVO TRANSPARENTE', 7),
  ('projeto', 'servico', 'ADESIVAÇÃO', 8),
  ('projeto', 'servico', 'CACHEPOT', 9),
  ('projeto', 'servico', 'CHAPA GALVANIZADA ADESIVADA', 10),
  ('projeto', 'servico', 'CHAPA GALVANIZADA PINTADA', 11),
  ('projeto', 'servico', 'DISPLAY', 12),
  ('projeto', 'servico', 'DISPLAY EM ACRILICO', 13),
  ('projeto', 'servico', 'ESTRUTURA DE ALUMINIO E LONA', 14),
  ('projeto', 'servico', 'ESTRUTURA DE METALON COM ACM', 15),
  ('projeto', 'servico', 'ESTRUTURA DE METALON COM ACM ADESIVADO', 16),
  ('projeto', 'servico', 'ESTRUTURA DE METALON E CHAPAS GALVANIZADAS', 17),
  ('projeto', 'servico', 'ESTRUTURA DE METALON E LONA', 18),
  ('projeto', 'servico', 'ESTRUTURA METALICA', 19),
  ('projeto', 'servico', 'ILUMINAÇÃO DE PLACA', 20),
  ('projeto', 'servico', 'INOX ADESIVADO', 21),
  ('projeto', 'servico', 'INSTALAÇÃO', 22),
  ('projeto', 'servico', 'LETREIRO', 23),
  ('projeto', 'servico', 'LETREIRO BACKLIGHT', 24),
  ('projeto', 'servico', 'LETREIRO EM PVC EXPANDIDO', 25),
  ('projeto', 'servico', 'LETREIRO RETROILUMINADO', 26),
  ('projeto', 'servico', 'LOGOMARCA', 27),
  ('projeto', 'servico', 'MANUTENCAO EM PLACA DE FACHADA', 28),
  ('projeto', 'servico', 'MDF', 29),
  ('projeto', 'servico', 'MDF ADESIVADO', 30),
  ('projeto', 'servico', 'MEDALHA', 31),
  ('projeto', 'servico', 'PLACA DE FACHADA', 32),
  ('projeto', 'servico', 'PLACA DE FACHADA COM FORRO', 33),
  ('projeto', 'servico', 'PLACA EM BRAILE', 34),
  ('projeto', 'servico', 'PLACA INDICATIVA', 35),
  ('projeto', 'servico', 'PS ADESIVADO', 36),
  ('projeto', 'servico', 'PVC EXPANDIDO', 37),
  ('projeto', 'servico', 'QUADRO EM MDF COM BOLSAS DE ACRILICO', 38),
  ('projeto', 'servico', 'QUIOSQUE', 39),
  ('projeto', 'servico', 'REFORMA DE LETREIRO', 40),
  ('projeto', 'servico', 'REVESTIMENTO EM ACM', 41),
  ('projeto', 'servico', 'REVESTIMENTO EM TELHA', 42),
  ('projeto', 'servico', 'ROLETA EM MDF', 43),
  ('projeto', 'servico', 'TOLDO', 44),
  ('projeto', 'servico', 'TOTEM', 45),
  ('projeto', 'servico', 'TROFEU', 46),
  ('projeto', 'insumos', 'ACM BRILHO', 0),
  ('projeto', 'insumos', 'ACM FOSCO', 1),
  ('projeto', 'insumos', 'ACRÍLICO 10 MM', 2),
  ('projeto', 'insumos', 'ACRÍLICO 2 MM', 3),
  ('projeto', 'insumos', 'ACRÍLICO 2 MM - LEITOSO', 4),
  ('projeto', 'insumos', 'ACRÍLICO 3 MM', 5),
  ('projeto', 'insumos', 'ACRÍLICO 3 MM - LEITOSO', 6),
  ('projeto', 'insumos', 'ACRÍLICO 4 MM', 7),
  ('projeto', 'insumos', 'ACRÍLICO 5 MM', 8),
  ('projeto', 'insumos', 'ACRÍLICO 8 MM', 9),
  ('projeto', 'insumos', 'ACRILICO COLORIDO', 10),
  ('projeto', 'insumos', 'ADESIVO BACKFILM FOSCO', 11),
  ('projeto', 'insumos', 'ADESIVO BLACKOUT BRILHO', 12),
  ('projeto', 'insumos', 'ADESIVO BLACKOUT FOSCO', 13),
  ('projeto', 'insumos', 'ADESIVO BRILHO', 14),
  ('projeto', 'insumos', 'ADESIVO FOSCO', 15),
  ('projeto', 'insumos', 'ADESIVO INFLEX 2000', 16),
  ('projeto', 'insumos', 'ADESIVO JATEADO', 17),
  ('projeto', 'insumos', 'ADESIVO ORACAL', 18),
  ('projeto', 'insumos', 'ADESIVO PERFURADO', 19),
  ('projeto', 'insumos', 'ADESIVO PISOTAK', 20),
  ('projeto', 'insumos', 'ADESIVO RECORTE', 21),
  ('projeto', 'insumos', 'ADESIVO REFLETIVO', 22),
  ('projeto', 'insumos', 'ADESIVO TRANSPARENTE', 23),
  ('projeto', 'insumos', 'ADESIVO VINIL', 24),
  ('projeto', 'insumos', 'CANTONEIRA 1" - 6 mts cada', 25),
  ('projeto', 'insumos', 'CANTONEIRA 3/4 - 6 mts cada', 26),
  ('projeto', 'insumos', 'CANTONEIRA 5/8 - 6 mts cada', 27),
  ('projeto', 'insumos', 'CHAPA GALVANIZADA 22', 28),
  ('projeto', 'insumos', 'CHAPA GALVANIZADA 24', 29),
  ('projeto', 'insumos', 'CHAPA GALVANIZADA 26', 30),
  ('projeto', 'insumos', 'CHAPA GALVANIZADA 28', 31),
  ('projeto', 'insumos', 'COR LED - FRIO', 32),
  ('projeto', 'insumos', 'COR LED - NEUTRO', 33),
  ('projeto', 'insumos', 'COR LED - QUENTE', 34),
  ('projeto', 'insumos', 'ESTRUTURA DE ALUMINIO', 35),
  ('projeto', 'insumos', 'ESTRUTURA DE METALON', 36),
  ('projeto', 'insumos', 'EUCALIPTO', 37),
  ('projeto', 'insumos', 'FILM BACK LIGHT FOSCO', 38),
  ('projeto', 'insumos', 'FONTE GRANDE - 30 A', 39),
  ('projeto', 'insumos', 'FONTE MEDIA - 15 A', 40),
  ('projeto', 'insumos', 'FOTOCELULA', 41),
  ('projeto', 'insumos', 'INSULFILM', 42),
  ('projeto', 'insumos', 'LAMPADA TUBULAR LED 120 CM', 43),
  ('projeto', 'insumos', 'LAMPADA TUBULAR LED 60 CM', 44),
  ('projeto', 'insumos', 'LETREIRO EM ACM', 45),
  ('projeto', 'insumos', 'LETREIRO EM ACRILICO', 46),
  ('projeto', 'insumos', 'LETREIRO EM CHAPA GALVANIZADA', 47),
  ('projeto', 'insumos', 'LETREIRO EM MDF', 48),
  ('projeto', 'insumos', 'LETREIRO EM PVC EXPANDIDO', 49),
  ('projeto', 'insumos', 'LOGOMARCA EM ACM', 50),
  ('projeto', 'insumos', 'LOGOMARCA EM ACRILICO', 51),
  ('projeto', 'insumos', 'LOGOMARCA EM CHAPA GALVANIZADA', 52),
  ('projeto', 'insumos', 'LOGOMARCA EM PVC', 53),
  ('projeto', 'insumos', 'LOGOMARCA EM PVC EXPANDIDO', 54),
  ('projeto', 'insumos', 'LONA BACK LIGHT BRILHO', 55),
  ('projeto', 'insumos', 'LONA BACK LIGHT FOSCO', 56),
  ('projeto', 'insumos', 'LONA FRONT BRILHO', 57),
  ('projeto', 'insumos', 'LONA FRONT FOSCO', 58),
  ('projeto', 'insumos', 'MANGUEIRA NEON LED 12V', 59),
  ('projeto', 'insumos', 'MANTA ASFÁLTICA - 30cm X 10m', 60),
  ('projeto', 'insumos', 'MASCARA IMPRIMAX TRANSPARENTE', 61),
  ('projeto', 'insumos', 'MDF 02 MM', 62),
  ('projeto', 'insumos', 'MDF 03 MM', 63),
  ('projeto', 'insumos', 'MDF 06 MM', 64),
  ('projeto', 'insumos', 'MDF 10 MM', 65),
  ('projeto', 'insumos', 'MDF 15 MM', 66),
  ('projeto', 'insumos', 'MDF 18 MM', 67),
  ('projeto', 'insumos', 'MDF 20 MM', 68),
  ('projeto', 'insumos', 'METALON 15 X 15', 69),
  ('projeto', 'insumos', 'METALON 20 X 20', 70),
  ('projeto', 'insumos', 'METALON 20 X 30', 71),
  ('projeto', 'insumos', 'METALON 20 X 40', 72),
  ('projeto', 'insumos', 'METALON 25 X 25', 73),
  ('projeto', 'insumos', 'METALON 30 X 30', 74),
  ('projeto', 'insumos', 'METALON 40 X 20', 75),
  ('projeto', 'insumos', 'METALON 40 X 40', 76),
  ('projeto', 'insumos', 'METALON 70 X 30', 77),
  ('projeto', 'insumos', 'PAPEL', 78),
  ('projeto', 'insumos', 'PS 1 MM', 79),
  ('projeto', 'insumos', 'PS 2 MM', 80),
  ('projeto', 'insumos', 'PS 3 MM', 81),
  ('projeto', 'insumos', 'PS CRISTAL', 82),
  ('projeto', 'insumos', 'PVC EXPANDIDO 03 MM', 83),
  ('projeto', 'insumos', 'PVC EXPANDIDO 05 MM', 84),
  ('projeto', 'insumos', 'PVC EXPANDIDO 06 MM', 85),
  ('projeto', 'insumos', 'PVC EXPANDIDO 10 MM', 86),
  ('projeto', 'insumos', 'PVC EXPANDIDO 15 MM', 87),
  ('projeto', 'insumos', 'PVC EXPANDIDO 18 MM', 88),
  ('projeto', 'insumos', 'PVC EXPANDIDO 20 MM', 89),
  ('projeto', 'insumos', 'REFLETOR LED 100 W', 90),
  ('projeto', 'insumos', 'REFLETOR LED 30 W', 91),
  ('projeto', 'insumos', 'REFLETOR LED 50 W', 92),
  ('projeto', 'insumos', 'TIMER', 93),
  ('projeto', 'insumos', 'TINTA', 94),
  ('projeto', 'insumos', 'TOTEM EM ESTRUTURA METALICA COM REVESTIMENTO EM ACM', 95),
  ('projeto', 'insumos', 'TUBO DE ALUMINIO 25X25', 96),
  ('projeto', 'insumos', 'TUBO DE ALUMINIO 25X50', 97),
  ('projeto', 'insumos', 'TUBO REDONDO 2 x 14', 98),
  ('projeto', 'insumos', 'TUBO REDONDO 3 x 16', 99),
  ('projeto', 'insumos', 'VERGALHAO 5/16', 100),
  ('projeto', 'insumos', 'ACRÍLICO 6MM', 101),
  ('projeto', 'insumos', 'ACRILICO 1MM', 102),
  ('projeto', 'insumos', 'DUPLA FACE', 103),
  ('projeto', 'acabamento', 'APLICAR VERNIZ', 0),
  ('projeto', 'acabamento', 'BARRA ROSCADA', 1),
  ('projeto', 'acabamento', 'BASTÃO', 2),
  ('projeto', 'acabamento', 'CABO DE AÇO', 3),
  ('projeto', 'acabamento', 'CABO DE SOM', 4),
  ('projeto', 'acabamento', 'CABO PARALELO 1,50', 5),
  ('projeto', 'acabamento', 'CABO PARALELO 2,50', 6),
  ('projeto', 'acabamento', 'CANTONEIRA DE ALUMÍNIO', 7),
  ('projeto', 'acabamento', 'CORTE LASER', 8),
  ('projeto', 'acabamento', 'CORTE ROUTER', 9),
  ('projeto', 'acabamento', 'GRAVAÇÃO LASER', 10),
  ('projeto', 'acabamento', 'ILHÓS', 11),
  ('projeto', 'acabamento', 'LAMINAR COM BRANCO', 12),
  ('projeto', 'acabamento', 'LAMINAR COM FOSCO', 13),
  ('projeto', 'acabamento', 'LAMINAR COM TRANSPARENTE', 14),
  ('projeto', 'acabamento', 'MADEIRA', 15),
  ('projeto', 'acabamento', 'PARAFUSO AUTOBROCANTE', 16),
  ('projeto', 'acabamento', 'PINTURA', 17),
  ('projeto', 'acabamento', 'PONTEIRA', 18),
  ('projeto', 'acabamento', 'REBITE', 19),
  ('projeto', 'acabamento', 'TINTA DUCO', 20),
  ('projeto', 'acabamento', 'TINTA ESMALTE SINTÉTICO', 21),
  ('projeto', 'acabamento', 'TINTA POLIESTER', 22),
  ('projeto', 'acabamento', 'VEDA BORDA', 23),
  ('projeto', 'acabamento', 'DUPLA FACE', 24),
  ('projeto', 'instalacao', 'ABRAÇADEIRA PARA LONA', 0),
  ('projeto', 'instalacao', 'BOTÃO DE FENDA', 1),
  ('projeto', 'instalacao', 'BUCHA E PARAFUSO 10', 2),
  ('projeto', 'instalacao', 'CLIENTE VEM BUSCAR', 3),
  ('projeto', 'instalacao', 'COLA ACRILICO', 4),
  ('projeto', 'instalacao', 'COLA SUPERCIANO', 5),
  ('projeto', 'instalacao', 'CONTATO PRÉVIO COM CLIENTE', 6),
  ('projeto', 'instalacao', 'DESPACHAR MATERIAL', 7),
  ('projeto', 'instalacao', 'ENTREGAR LAILA', 8),
  ('projeto', 'instalacao', 'ENTREGAR MATERIAL NO CLIENTE', 9),
  ('projeto', 'instalacao', 'ENTREGAR VITOR', 10),
  ('projeto', 'instalacao', 'FITA ADESIVO DUPLA FACE', 11),
  ('projeto', 'instalacao', 'FITA DUPLA FACE', 12),
  ('projeto', 'instalacao', 'FITA DUPLA FACE DE ACM', 13),
  ('projeto', 'instalacao', 'FITA DUPLA FACE TRANSPARENTE', 14),
  ('projeto', 'instalacao', 'FITA ESPUMA', 15),
  ('projeto', 'instalacao', 'FOTOGRAFAR ANTES E DEPOIS', 16),
  ('projeto', 'instalacao', 'LIMPEZA ANTES INSTALAÇÃO', 17),
  ('projeto', 'instalacao', 'PARABOLT 8MM', 18),
  ('projeto', 'instalacao', 'PARAFUSO', 19),
  ('projeto', 'instalacao', 'PARAFUSO 5/16 (OUTDOOR) + PORCA', 20),
  ('projeto', 'instalacao', 'PARAFUSO ATARRAXANTE', 21),
  ('projeto', 'instalacao', 'PARAFUSO AUTOBROCANTE FLANGEADO', 22),
  ('projeto', 'instalacao', 'PARAFUSO COM BUCHA', 23),
  ('projeto', 'instalacao', 'PARAFUSO E BUCHA 06 DRYWALL', 24),
  ('projeto', 'instalacao', 'PU HIBRIDRO', 25),
  ('projeto', 'instalacao', 'RETIRAR ADESIVO ANTIGO', 26),
  ('projeto', 'instalacao', 'VEDA CALHA', 27),
  ('midia', 'servico', 'ADESIVO COM APLICAÇÃO DE ADESIVO PARA PROTEÇÃO', 0),
  ('midia', 'servico', 'ADESIVO COM MANTA MAGNETICA', 1),
  ('midia', 'servico', 'ADESIVO JATEADO RECORTADO', 2),
  ('midia', 'servico', 'ADESIVO RECORTE', 3),
  ('midia', 'servico', 'ADESIVO REFLETIVO', 4),
  ('midia', 'servico', 'ADESIVO SEM IMPRESSÃO COM INSTALAÇÃO', 5),
  ('midia', 'servico', 'APLIQUE', 6),
  ('midia', 'servico', 'BACKDROP', 7),
  ('midia', 'servico', 'BANNER', 8),
  ('midia', 'servico', 'CARTAO DE VISITA', 9),
  ('midia', 'servico', 'COLAGEM DE IMPRESSÃO', 10),
  ('midia', 'servico', 'COLAGEM DE OUTDOOR', 11),
  ('midia', 'servico', 'CRIAÇÃO DE IDENTIDADE VISUAL', 12),
  ('midia', 'servico', 'DESLOCAMENTO', 13),
  ('midia', 'servico', 'DIVERSOS', 14),
  ('midia', 'servico', 'EMPENA', 15),
  ('midia', 'servico', 'ENERGIA ELETRICA', 16),
  ('midia', 'servico', 'FAIXA ADESIVADA', 17),
  ('midia', 'servico', 'FAIXA EM LONA', 18),
  ('midia', 'servico', 'FOLHA BRANCA', 19),
  ('midia', 'servico', 'FRONT LIGHT', 20),
  ('midia', 'servico', 'IDENTIFICAÇÃO INTERNA', 21),
  ('midia', 'servico', 'ILUMINAÇÃO DE PAINEL', 22),
  ('midia', 'servico', 'IMPRESSÃO DE ADESIVO', 23),
  ('midia', 'servico', 'IMPRESSÃO DE OUTDOOR', 24),
  ('midia', 'servico', 'IMPRESSÃO EM LONA', 25),
  ('midia', 'servico', 'IMPRESSÃO EM PAPEL', 26),
  ('midia', 'servico', 'INSTALAÇÃO', 27),
  ('midia', 'servico', 'INSTALAÇÃO DE ADESIVO', 28),
  ('midia', 'servico', 'INSTALAÇÃO DE LONA', 29),
  ('midia', 'servico', 'INSULFILM', 30),
  ('midia', 'servico', 'LOCAÇÃO DE BACKDROP', 31),
  ('midia', 'servico', 'LOCAÇÃO DE ESTRUTURA', 32),
  ('midia', 'servico', 'MANUTENÇÃO', 33),
  ('midia', 'servico', 'MANUTENÇÃO EM PLACA DE OUTDOOR', 34),
  ('midia', 'servico', 'MUPI', 35),
  ('midia', 'servico', 'OUTDOOR', 36),
  ('midia', 'servico', 'OUTDOOR LONADO', 37),
  ('midia', 'servico', 'OUTDOOR PONTO NOBRE', 38),
  ('midia', 'servico', 'PAINEL DE ESTRADA', 39),
  ('midia', 'servico', 'PAINEL DE LED', 40),
  ('midia', 'servico', 'PAINEL FRONT LIGHT', 41),
  ('midia', 'servico', 'PATTY MOVEL', 42),
  ('midia', 'servico', 'PERSONALIZADO', 43),
  ('midia', 'servico', 'PLACA DE OUTDOOR', 44),
  ('midia', 'servico', 'PLOTAGEM', 45),
  ('midia', 'servico', 'PRODUÇÃO E COLAGEM DE OUTDOOR', 46),
  ('midia', 'servico', 'REFORMA DE OUTDOOR', 47),
  ('midia', 'servico', 'REFORMA DE PAINEL', 48),
  ('midia', 'servico', 'RETIRADA DE ADESIVO', 49),
  ('midia', 'servico', 'RETIRADA DE OUTDOOR', 50),
  ('midia', 'servico', 'RETIRADA DE PAINEL DE ESTRADA', 51),
  ('midia', 'servico', 'RETIRADA LONA', 52),
  ('midia', 'servico', 'RETIRADA PAINEL FRONT LIGHT', 53),
  ('midia', 'servico', 'RETOQUE EM OUTDOOR', 54),
  ('midia', 'servico', 'SUPORTE DE BANNER', 55),
  ('midia', 'servico', 'TRIEDRO', 56),
  ('midia', 'servico', 'WIND BANNER', 57),
  ('midia', 'insumos', 'ADESIVO BACKFILM FOSCO', 0),
  ('midia', 'insumos', 'ADESIVO BLACKOUT BRILHO', 1),
  ('midia', 'insumos', 'ADESIVO BLACKOUT FOSCO', 2),
  ('midia', 'insumos', 'ADESIVO IMPRESSO BRILHO', 3),
  ('midia', 'insumos', 'ADESIVO IMPRESSO FOSCO', 4),
  ('midia', 'insumos', 'ADESIVO JATEADO', 5),
  ('midia', 'insumos', 'ADESIVO ORACAL', 6),
  ('midia', 'insumos', 'ADESIVO PERFURADO', 7),
  ('midia', 'insumos', 'ADESIVO PISOTAK', 8),
  ('midia', 'insumos', 'ADESIVO RECORTE', 9),
  ('midia', 'insumos', 'ADESIVO REFLETIVO', 10),
  ('midia', 'insumos', 'ADESIVO TRANSPARENTE', 11),
  ('midia', 'insumos', 'ADESIVO VINIL', 12),
  ('midia', 'insumos', 'BASTÃO 5/8', 13),
  ('midia', 'insumos', 'BASTÃO 7/8', 14),
  ('midia', 'insumos', 'BUCHA 06', 15),
  ('midia', 'insumos', 'BUCHA 08', 16),
  ('midia', 'insumos', 'BUCHA 10', 17),
  ('midia', 'insumos', 'CABO PARALELO 0,75 MM', 18),
  ('midia', 'insumos', 'CABO PARALELO 1,50 MM', 19),
  ('midia', 'insumos', 'CABO PARALELO 2,50 MM', 20),
  ('midia', 'insumos', 'COMPENSADO 4 MM', 21),
  ('midia', 'insumos', 'CONCRETO', 22),
  ('midia', 'insumos', 'CORRENTE', 23),
  ('midia', 'insumos', 'EUCALIPTO 3MTS 8 -10', 24),
  ('midia', 'insumos', 'EUCALIPTO 4MTS 8 -10', 25),
  ('midia', 'insumos', 'EUCALIPTO 6MTS 12 -14', 26),
  ('midia', 'insumos', 'EUCALIPTO 6MTS 14 -16', 27),
  ('midia', 'insumos', 'EUCALIPTO 7MTS 12 -14', 28),
  ('midia', 'insumos', 'EUCALIPTO 7MTS 14 -16', 29),
  ('midia', 'insumos', 'FITA AMARELA - 30 M', 30),
  ('midia', 'insumos', 'FOTOCELULA', 31),
  ('midia', 'insumos', 'LONA BACK LIGHT BRILHO', 32),
  ('midia', 'insumos', 'LONA BACK LIGHT FOSCO', 33),
  ('midia', 'insumos', 'LONA FRONT BRILHO', 34),
  ('midia', 'insumos', 'LONA FRONT FOSCO', 35),
  ('midia', 'insumos', 'MADERITE 5MM', 36),
  ('midia', 'insumos', 'MADERITE 6MM', 37),
  ('midia', 'insumos', 'MANTA MAGNÉTICA', 38),
  ('midia', 'insumos', 'MASCARA IMPRIMAX TRANSPARENTE', 39),
  ('midia', 'insumos', 'PAPEL 76X112 90GR', 40),
  ('midia', 'insumos', 'PAPEL OUTDOOR', 41),
  ('midia', 'insumos', 'TRANSPARENTE BRILHO', 42),
  ('midia', 'insumos', 'TRANSPARENTE FOSCO', 43),
  ('midia', 'insumos', 'VINIL BRANCO', 44),
  ('midia', 'insumos', 'VINIL PRETO', 45),
  ('midia', 'acabamento', 'APLICAÇÃO DE VERNIZ', 0),
  ('midia', 'acabamento', 'ILHOS', 1),
  ('midia', 'acabamento', 'JATEADO', 2),
  ('midia', 'acabamento', 'LAMINAÇÃO BRILHO', 3),
  ('midia', 'acabamento', 'LAMINAÇÃO COM BRANCO', 4),
  ('midia', 'acabamento', 'LAMINAÇÃO FOSCA', 5),
  ('midia', 'acabamento', 'PARAFUSO', 6),
  ('midia', 'acabamento', 'PONTEIRA 5/8', 7),
  ('midia', 'acabamento', 'PONTEIRA 7/8', 8),
  ('midia', 'acabamento', 'RECORTE', 9),
  ('midia', 'acabamento', 'REFLETOR 100 WATTS', 10),
  ('midia', 'acabamento', 'REFLETOR 30 WATTS', 11),
  ('midia', 'acabamento', 'REFLETOR 50 WATTS', 12),
  ('midia', 'acabamento', 'SARRAFO 10x2x3', 13),
  ('midia', 'acabamento', 'SARRAFO 6x3x3', 14),
  ('midia', 'acabamento', 'SILICONE 280 gr', 15),
  ('midia', 'acabamento', 'TIMER', 16),
  ('midia', 'acabamento', 'TINTA AUTOMOTIVA BRANCA -FERROLAK', 17),
  ('midia', 'acabamento', 'TINTA CINZA', 18),
  ('midia', 'acabamento', 'TINTA LARANA', 19),
  ('midia', 'acabamento', 'TINTA PRETO', 20),
  ('midia', 'acabamento', 'VERGALHÃO 5/16 LISO', 21),
  ('midia', 'acabamento', 'VERNIZ PRA LONA 900 ml', 22),
  ('midia', 'instalacao', 'PAREDE', 0),
  ('midia', 'instalacao', 'PLACA', 1),
  ('midia', 'instalacao', 'PORTA', 2),
  ('midia', 'instalacao', 'VIDRO', 3),
  ('midia', 'instalacao', 'PERSONALIZADOS', 4),
  ('midia', 'instalacao', 'SOMENTE ENTREGAR', 5),
  ('todos', 'projetista', 'VEIO PRONTO', 0),
  ('todos', 'projetista', 'ALEC', 1),
  ('todos', 'projetista', 'BRUNO', 2),
  ('todos', 'projetista', 'IRAUAN', 3),
  ('todos', 'projetista', 'LAILA', 4),
  ('todos', 'projetista', 'TONINHO', 5),
  ('todos', 'vendedor', 'EDUARDO', 0),
  ('todos', 'vendedor', 'ELIZETE', 1),
  ('todos', 'vendedor', 'FLAVIANE', 2),
  ('todos', 'vendedor', 'LAILA', 3),
  ('todos', 'vendedor', 'MEIRE', 4),
  ('todos', 'vendedor', 'VITOR', 5)
on conflict do nothing;
