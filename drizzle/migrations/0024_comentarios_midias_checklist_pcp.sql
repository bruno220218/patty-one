-- ============ Comentários nas liberações, mídias dos painéis e checklist para o PCP ============
-- 1) Comentários: qualquer pessoa aprovada da equipe comenta uma liberação (ex.: Produção lê e
--    comenta as liberações de mídia). O comentário entra no histórico da liberação e avisa
--    quem criou, PCP/direção e quem já comentou.
-- 2) Mídias dos painéis: cada painel guarda o link de onde ficam as mídias (Drive para RGB 1–7,
--    sistema vnnox para o PA01). Criação e gestão alteram.
-- 3) Checklists: o PCP passa a gerenciar os checklists e a criar projetos a partir deles,
--    como a gestão.
-- Rode depois da 0023 (0022 = Mídia OOH, 0023 = bi-semanas). Pode rodar mais de uma vez.

-- ---------- 1) Comentários nas liberações ----------
alter table public.liberacao_eventos drop constraint if exists liberacao_eventos_tipo_check;
alter table public.liberacao_eventos add constraint liberacao_eventos_tipo_check
  check (tipo in ('criada', 'reprovada', 'reenviada', 'aprovada', 'email_enviado', 'comentario'));

alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                  'liberacao_reprovada', 'liberacao_aprovada', 'liberacao_comentario',
                  'briefing_novo', 'briefing_andamento', 'briefing_concluido',
                  'visita_nova', 'visita_agendada', 'visita_realizada', 'visita_cancelada',
                  'rgb_vencendo', 'rgb_vence_hoje', 'rgb_vencida',
                  'ci_nova', 'ci_vinheta_entrou', 'ci_recusada',
                  'ci_foto_solicitada', 'ci_foto_enviada'));

-- Os comentários só entram por esta função (a tabela do histórico não aceita gravação direta).
create or replace function public.comentar_liberacao(_liberacao_id uuid, _texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lib public.liberacoes;
  v_texto text := trim(coalesce(_texto, ''));
  v_nome text := coalesce(nullif(public.current_display_name(), ''), 'Alguém da equipe');
  v_id uuid;
begin
  if not public.is_team_member(auth.uid()) then
    raise exception 'Sua conta ainda não foi aprovada por um gestor.' using errcode = '42501';
  end if;
  if v_texto = '' then
    raise exception 'Escreva o comentário.' using errcode = '23514';
  end if;
  if length(v_texto) > 2000 then
    raise exception 'Comentário muito longo (até 2000 caracteres).' using errcode = '23514';
  end if;
  select * into v_lib from public.liberacoes where id = _liberacao_id;
  if v_lib.id is null then
    raise exception 'Liberação não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.liberacao_eventos (liberacao_id, tipo, detalhe, autor, autor_nome)
  values (_liberacao_id, 'comentario', v_texto, auth.uid(), v_nome)
  returning id into v_id;

  -- Quem criou, PCP/direção (gestão se não houver ninguém) e quem já comentou; nunca quem comentou agora.
  insert into public.notifications
    (recipient_id, tipo, liberacao_id, liberacao_numero, actor_name, project_name, detalhe,
     link, ref_numero)
  select distinct d, 'liberacao_comentario', v_lib.id, v_lib.numero, v_nome, v_lib.cliente,
         left(v_texto, 200), '/liberacoes/' || v_lib.id, v_lib.numero
    from unnest(
           array[v_lib.created_by]
           || public.pessoas_com_funcao(array['pcp', 'direcao'])
           || array(select e.autor from public.liberacao_eventos e
                     where e.liberacao_id = v_lib.id and e.tipo = 'comentario' and e.autor is not null)
         ) as d
   where d is not null and d is distinct from auth.uid();

  return v_id;
end $$;
revoke execute on function public.comentar_liberacao(uuid, text) from public, anon;
grant execute on function public.comentar_liberacao(uuid, text) to authenticated;

-- ---------- 2) Mídias dos painéis ----------
alter table public.paineis add column if not exists midias_link text not null default '';
alter table public.paineis drop constraint if exists paineis_midias_link_check;
alter table public.paineis add constraint paineis_midias_link_check
  check (midias_link = '' or (midias_link ~* '^https?://[^[:space:]]+$' and length(midias_link) <= 2000));

-- O PA01 usa outro sistema de gestão de mídia.
update public.paineis set midias_link = 'https://us.vnnox.com'
 where codigo = 'PA01' and midias_link = '';

-- Criação e gestão trocam o link (a edição direta dos painéis continua só com a gestão).
create or replace function public.salvar_link_midias_painel(_painel_id uuid, _link text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_link text := trim(coalesce(_link, ''));
begin
  if not public.can_editar_paineis(auth.uid()) then
    raise exception 'Só a Criação e a gestão alteram o link das mídias.' using errcode = '42501';
  end if;
  if v_link <> '' and v_link !~* '^https?://[^[:space:]]+$' then
    raise exception 'Cole um link completo, começando com https://' using errcode = '23514';
  end if;
  update public.paineis set midias_link = v_link where id = _painel_id;
  if not found then
    raise exception 'Painel não encontrado.' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.salvar_link_midias_painel(uuid, text) from public, anon;
grant execute on function public.salvar_link_midias_painel(uuid, text) to authenticated;

-- ---------- 3) Checklists: PCP gerencia junto com a gestão ----------
create or replace function public.can_gerir_checklists(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'pcp'])
$$;
revoke execute on function public.can_gerir_checklists(uuid) from public, anon;
grant execute on function public.can_gerir_checklists(uuid) to authenticated, service_role;

drop policy if exists "Gestores manage checklists" on public.checklists;
drop policy if exists "Gestão e PCP gerenciam checklists" on public.checklists;
create policy "Gestão e PCP gerenciam checklists" on public.checklists
  for all to authenticated
  using (public.can_gerir_checklists(auth.uid()))
  with check (public.can_gerir_checklists(auth.uid()));

drop policy if exists "Gestores manage checklist tasks" on public.checklist_tasks;
drop policy if exists "Gestão e PCP gerenciam tarefas de checklist" on public.checklist_tasks;
create policy "Gestão e PCP gerenciam tarefas de checklist" on public.checklist_tasks
  for all to authenticated
  using (public.can_gerir_checklists(auth.uid()))
  with check (public.can_gerir_checklists(auth.uid()));

-- Igual à 0003, trocando "só gestores" por gestão ou PCP ao criar a partir de um checklist.
create or replace function public.create_project(
  _name text, _description text, _due_date date, _checklist_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
  _locked boolean := false;
begin
  if auth.uid() is null then raise exception 'Faça login para continuar.'; end if;
  if not public.is_team_member(auth.uid()) then
    raise exception 'Sua conta ainda não foi aprovada por um gestor.';
  end if;
  if coalesce(trim(_name), '') = '' then raise exception 'O nome do projeto é obrigatório.'; end if;

  if _checklist_id is not null then
    if not public.can_gerir_checklists(auth.uid()) then
      raise exception 'Somente gestão ou PCP podem criar projetos a partir de checklists.';
    end if;
    select c.fixed_params into _locked from public.checklists c where c.id = _checklist_id;
    if not found then raise exception 'Checklist não encontrado.'; end if;
  end if;

  perform set_config('app.internal', 'on', true);
  insert into public.projects (name, description, due_date, source_checklist_id, locked, created_by)
  values (trim(_name), coalesce(trim(_description), ''), _due_date, _checklist_id,
          coalesce(_locked, false), auth.uid())
  returning id into _id;

  if _checklist_id is not null then
    insert into public.project_tasks (project_id, title, position)
    select _id, ct.title, row_number() over (order by ct.position, ct.created_at)
    from public.checklist_tasks ct where ct.checklist_id = _checklist_id;
  end if;
  perform set_config('app.internal', 'off', true);
  return _id;
end $$;
revoke execute on function public.create_project(text, text, date, uuid) from public, anon;
grant execute on function public.create_project(text, text, date, uuid) to authenticated;
