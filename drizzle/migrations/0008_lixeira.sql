-- ============ Lixeira: recuperar itens apagados ============
-- Todo item apagado (projeto, tarefa, liberação, checklist) é guardado aqui por 30 dias,
-- junto com o que foi apagado em cascata (tarefas, bloqueios, itens e histórico da liberação).
-- Quem apagou ou um gestor pode restaurar.

create table if not exists public.lixeira (
  id uuid primary key default gen_random_uuid(),
  lote bigint not null,                    -- transação do delete (agrupa item + cascata)
  tabela text not null,
  registro jsonb not null,
  principal boolean not null default false, -- o item que a pessoa apagou (o resto veio em cascata)
  tipo text not null default '',
  rotulo text not null default '',
  detalhe text not null default '',
  apagado_por uuid default auth.uid(),
  apagado_por_nome text not null default '',
  apagado_em timestamptz not null default now()
);
create index if not exists lixeira_lote_idx on public.lixeira (lote);
create index if not exists lixeira_apagado_em_idx on public.lixeira (apagado_em desc);

alter table public.lixeira enable row level security;
revoke all on public.lixeira from public, anon, authenticated;
grant select on public.lixeira to authenticated;
grant all on public.lixeira to service_role;

drop policy if exists "Gestores e quem apagou veem a lixeira" on public.lixeira;
create policy "Gestores e quem apagou veem a lixeira" on public.lixeira
  for select to authenticated
  using (public.has_role(auth.uid(), 'gestor') or apagado_por = auth.uid());

-- Guarda a linha apagada.
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
  -- Restauração em andamento: não guardar de novo.
  if current_setting('app.restaurando', true) = 'on' then
    return old;
  end if;
  -- Itens da liberação são trocados a cada "Salvar"; só guardar quando a liberação inteira é apagada.
  if tg_table_name = 'liberacao_itens' and is_principal then
    return old;
  end if;

  if tg_table_name = 'projects' then
    v_tipo := 'Projeto';
    v_rotulo := old.name;
    -- Lembra as liberações ligadas, que perdem o vínculo (on delete set null).
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
  end if;

  select coalesce(pr.display_name, '') into v_nome from public.profiles pr where pr.id = auth.uid();

  insert into public.lixeira (lote, tabela, registro, principal, tipo, rotulo, detalhe, apagado_por, apagado_por_nome)
  values (txid_current(), tg_table_name, v_registro, is_principal, v_tipo,
          coalesce(v_rotulo, ''), coalesce(v_detalhe, ''), auth.uid(), coalesce(v_nome, ''));

  -- Limpeza: some depois de 30 dias.
  if is_principal then
    delete from public.lixeira where apagado_em < now() - interval '30 days';
  end if;
  return old;
end $$;
revoke execute on function public.lixeira_guardar() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['projects','project_tasks','project_blockers','liberacoes',
                           'liberacao_itens','liberacao_eventos','checklists','checklist_tasks']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_lixeira', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.lixeira_guardar()',
                   t || '_lixeira', t);
  end loop;
end $$;

-- Restaura um lote (o item e tudo o que foi apagado junto).
create or replace function public.restaurar_lixeira(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_dono uuid;
  v_ordem constant text[] := array['checklists','projects','liberacoes',
    'checklist_tasks','project_tasks','project_blockers','liberacao_itens','liberacao_eventos'];
begin
  select l.apagado_por into v_dono from public.lixeira l where l.lote = p_lote and l.principal limit 1;
  if not found then
    raise exception 'Item não encontrado na lixeira (pode ter passado de 30 dias).';
  end if;
  if not (public.has_role(auth.uid(), 'gestor') or v_dono = auth.uid()) then
    raise exception 'Somente gestores ou quem apagou podem restaurar este item.';
  end if;

  -- Restaurar sem disparar regras de criação (status, numeração, avisos, histórico duplicado).
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
    -- O "pai" precisa existir (as FKs ficam desligadas durante a restauração).
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

    -- Projeto: religar as liberações que apontavam pra ele.
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

-- Apagar de vez (só gestor).
create or replace function public.esvaziar_lixeira_item(p_lote bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'gestor') then
    raise exception 'Somente gestores podem apagar definitivamente.';
  end if;
  delete from public.lixeira where lote = p_lote;
end $$;
revoke execute on function public.esvaziar_lixeira_item(bigint) from public, anon;
grant execute on function public.esvaziar_lixeira_item(bigint) to authenticated;
