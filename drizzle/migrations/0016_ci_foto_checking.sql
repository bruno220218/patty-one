-- ============ CI: solicitação de foto (checking fotográfico) ============
-- Depois que a vinheta entrou no painel, quem acompanha a CI pede a foto de comprovação
-- da veiculação. O Checking fotográfico recebe o aviso, tira as fotos, envia pelo app
-- (vão para o Drive, na pasta da CI) e marca como enviada; quem pediu é avisado.
-- Rode depois da 0013, 0014 e 0015.

-- ---------- Função nova ----------
alter type public.app_role add value if not exists 'checking';

-- ---------- Pedidos ----------
create table if not exists public.ci_fotos_pedidos (
  id uuid primary key default gen_random_uuid(),
  ci_id uuid not null references public.cis (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'enviada', 'cancelada')),
  observacao text not null default '' check (length(observacao) <= 500),
  pedido_por uuid references auth.users (id) on delete set null,
  pedido_por_nome text not null default '',
  pedido_em timestamptz not null default now(),
  atendido_por uuid references auth.users (id) on delete set null,
  atendido_por_nome text not null default '',
  atendido_em timestamptz
);
-- Um pedido aberto por CI de cada vez.
create unique index if not exists ci_fotos_um_pendente
  on public.ci_fotos_pedidos (ci_id) where status = 'pendente';
create index if not exists ci_fotos_pedidos_ci_idx on public.ci_fotos_pedidos (ci_id, pedido_em desc);

alter table public.ci_fotos_pedidos enable row level security;
revoke all on public.ci_fotos_pedidos from public, anon, authenticated;
grant select on public.ci_fotos_pedidos to authenticated;
drop policy if exists "ci_fotos_ver" on public.ci_fotos_pedidos;
create policy "ci_fotos_ver" on public.ci_fotos_pedidos
  for select to authenticated using (public.is_team_member(auth.uid()));

-- Quem pede: comercial, criação e gestão. Quem atende: checking e gestão.
create or replace function public.can_pedir_foto(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial', 'criacao'])
$$;
create or replace function public.can_fazer_checking(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'checking'])
$$;
revoke execute on function public.can_pedir_foto(uuid) from public, anon;
revoke execute on function public.can_fazer_checking(uuid) from public, anon;
grant execute on function public.can_pedir_foto(uuid) to authenticated;
grant execute on function public.can_fazer_checking(uuid) to authenticated;

-- ---------- Fotos: anexos da CI com entidade 'ci_foto' ----------
alter table public.anexos drop constraint if exists anexos_entidade_check;
alter table public.anexos add constraint anexos_entidade_check
  check (entidade in ('liberacao', 'briefing', 'visita', 'ci', 'ci_foto'));

-- ---------- Avisos ----------
alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                  'liberacao_reprovada', 'liberacao_aprovada',
                  'briefing_novo', 'briefing_andamento', 'briefing_concluido',
                  'visita_nova', 'visita_agendada', 'visita_realizada', 'visita_cancelada',
                  'rgb_vencendo', 'rgb_vence_hoje', 'rgb_vencida',
                  'ci_nova', 'ci_vinheta_entrou', 'ci_recusada',
                  'ci_foto_solicitada', 'ci_foto_enviada'));

-- ---------- Ações ----------
create or replace function public.solicitar_foto_ci(_ci_id uuid, _observacao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ci public.cis;
  v_id uuid;
  v_paineis text;
begin
  if not public.can_pedir_foto(auth.uid()) then
    raise exception 'Só comercial, criação e gestão pedem fotos.' using errcode = '42501';
  end if;
  select * into v_ci from public.cis where id = _ci_id;
  if v_ci.id is null then
    raise exception 'CI não encontrada.' using errcode = 'P0002';
  end if;
  select string_agg(p.codigo, ', ' order by p.ordem) into v_paineis
    from public.ci_paineis cp join public.paineis p on p.id = cp.painel_id
   where cp.ci_id = _ci_id and cp.status = 'aprovada';
  if v_paineis is null then
    raise exception 'A vinheta ainda não entrou em nenhum painel: dê entrada antes de pedir a foto.'
      using errcode = '23514';
  end if;
  if exists (select 1 from public.ci_fotos_pedidos where ci_id = _ci_id and status = 'pendente') then
    raise exception 'Já existe um pedido de foto aberto para esta CI.' using errcode = '23505';
  end if;

  insert into public.ci_fotos_pedidos (ci_id, observacao, pedido_por, pedido_por_nome)
  values (_ci_id, left(trim(coalesce(_observacao, '')), 500), auth.uid(),
          coalesce(nullif(public.current_display_name(), ''), 'Alguém da equipe'))
  returning id into v_id;

  perform public.avisar(public.pessoas_com_funcao(array['checking']), 'ci_foto_solicitada',
    '/cis/' || _ci_id, v_ci.numero, v_ci.cliente,
    'Foto da CI ' || public.ci_rotulo(v_ci.numero, v_ci.data) || ' · ' || v_paineis
      || case when trim(coalesce(_observacao, '')) <> '' then ' · ' || left(trim(_observacao), 200) else '' end);
  return v_id;
end $$;

create or replace function public.concluir_foto_ci(_pedido_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.ci_fotos_pedidos;
  v_ci public.cis;
  v_fotos integer;
begin
  if not public.can_fazer_checking(auth.uid()) then
    raise exception 'Só o checking fotográfico e a gestão concluem o pedido.' using errcode = '42501';
  end if;
  select * into v_p from public.ci_fotos_pedidos where id = _pedido_id for update;
  if v_p.id is null or v_p.status <> 'pendente' then
    raise exception 'Este pedido não está mais aberto.' using errcode = '23514';
  end if;
  select count(*) into v_fotos from public.anexos
   where entidade = 'ci_foto' and entidade_id = v_p.ci_id and created_at >= v_p.pedido_em;
  if v_fotos = 0 then
    raise exception 'Envie pelo menos uma foto antes de concluir.' using errcode = '23514';
  end if;

  update public.ci_fotos_pedidos set
    status = 'enviada', atendido_por = auth.uid(),
    atendido_por_nome = coalesce(nullif(public.current_display_name(), ''), 'Alguém da equipe'),
    atendido_em = now()
  where id = v_p.id;

  select * into v_ci from public.cis where id = v_p.ci_id;
  perform public.avisar(array[v_p.pedido_por, v_ci.created_by], 'ci_foto_enviada',
    '/cis/' || v_ci.id, v_ci.numero, v_ci.cliente,
    v_fotos || case when v_fotos = 1 then ' foto' else ' fotos' end || ' da veiculação');
end $$;

create or replace function public.cancelar_foto_ci(_pedido_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.ci_fotos_pedidos;
begin
  select * into v_p from public.ci_fotos_pedidos where id = _pedido_id for update;
  if v_p.id is null or v_p.status <> 'pendente' then
    raise exception 'Este pedido não está mais aberto.' using errcode = '23514';
  end if;
  if v_p.pedido_por is distinct from auth.uid() and not public.has_role(auth.uid(), 'gestor') then
    raise exception 'Só quem pediu (ou a gestão) cancela o pedido.' using errcode = '42501';
  end if;
  update public.ci_fotos_pedidos set status = 'cancelada' where id = v_p.id;
end $$;

revoke execute on function public.solicitar_foto_ci(uuid, text) from public, anon;
revoke execute on function public.concluir_foto_ci(uuid) from public, anon;
revoke execute on function public.cancelar_foto_ci(uuid) from public, anon;
grant execute on function public.solicitar_foto_ci(uuid, text) to authenticated;
grant execute on function public.concluir_foto_ci(uuid) to authenticated;
grant execute on function public.cancelar_foto_ci(uuid) to authenticated;

-- Excluir a CI apaga também os registros das fotos (os arquivos continuam no Drive).
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
  delete from public.anexos where entidade in ('ci', 'ci_foto') and entidade_id = _id;
  delete from public.cis where id = _id;
end $$;
revoke execute on function public.excluir_ci(uuid) from public, anon;
grant execute on function public.excluir_ci(uuid) to authenticated;
