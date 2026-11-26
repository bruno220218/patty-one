-- Fluxo de produção, etapa 2 (docs/fluxo-producao-plano.md): "Solicitar prazo".
-- O comercial recebe o aceite do cliente e pede o prazo ao PCP pelo pedido; o PCP informa a
-- data e o comercial é avisado; a liberação do pedido já vem com esse prazo (data de entrega).
--   * pedido_prazos: o histórico de pedidos de prazo de cada pedido (um aberto por vez).
--   * Escritas só pelas funções solicitar_prazo / responder_prazo / cancelar_prazo
--     (security definer); a equipe aprovada lê.
--   * Pede: comercial e gestão (can_vender). Responde: PCP e gestão (can_gerir_operacao).
--   * Avisos por avisar(): 'prazo_solicitado' para o PCP, 'prazo_definido' para quem pediu.
-- Depende de 0010 (avisar), 0019 (can_gerir_operacao), 0020 (vendas) e 0028 (tipos de aviso).

create table if not exists public.pedido_prazos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'respondido', 'cancelado')),
  -- Pedido do comercial
  data_desejada date,
  observacao text not null default '' check (length(observacao) <= 2000),
  solicitado_por uuid references auth.users (id) on delete set null,
  solicitado_por_nome text not null default '',
  solicitado_em timestamptz not null default now(),
  -- Resposta do PCP
  prazo date,
  resposta text not null default '' check (length(resposta) <= 2000),
  respondido_por uuid references auth.users (id) on delete set null,
  respondido_por_nome text not null default '',
  respondido_em timestamptz,
  constraint pedido_prazos_resposta check ((status = 'respondido') = (prazo is not null))
);
create unique index if not exists pedido_prazos_um_aberto
  on public.pedido_prazos (venda_id) where status = 'aguardando';
create index if not exists pedido_prazos_venda_idx on public.pedido_prazos (venda_id, solicitado_em);
create index if not exists pedido_prazos_fila_idx on public.pedido_prazos (status, solicitado_em);

alter table public.pedido_prazos enable row level security;
revoke all on public.pedido_prazos from public, anon, authenticated;
grant select on public.pedido_prazos to authenticated;
grant all on public.pedido_prazos to service_role;

drop policy if exists "Equipe lê prazos" on public.pedido_prazos;
create policy "Equipe lê prazos" on public.pedido_prazos
  for select to authenticated using (public.is_team_member(auth.uid()));

-- ---------- Avisos ----------
alter table public.notifications drop constraint if exists notifications_tipo_check;
alter table public.notifications add constraint notifications_tipo_check
  check (tipo in ('tarefa_concluida', 'liberacao_nova', 'liberacao_reenviada',
                  'liberacao_reprovada', 'liberacao_aprovada', 'liberacao_comentario',
                  'briefing_novo', 'briefing_andamento', 'briefing_concluido',
                  'visita_nova', 'visita_agendada', 'visita_realizada', 'visita_cancelada',
                  'rgb_vencendo', 'rgb_vence_hoje', 'rgb_vencida',
                  'ci_nova', 'ci_vinheta_entrou', 'ci_recusada',
                  'ci_foto_solicitada', 'ci_foto_enviada',
                  'ci_checkout_solicitada', 'ci_checkout_enviada',
                  'prazo_solicitado', 'prazo_definido'));

-- ---------- Ações ----------
-- Comercial/gestão pedem o prazo de um pedido (não cancelado, sem outro pedido aberto).
create or replace function public.solicitar_prazo(
  _venda_id uuid, _data_desejada date, _observacao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.vendas;
  v_cliente text;
  v_id uuid;
  v_obs text := btrim(coalesce(_observacao, ''));
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só comercial e gestão pedem prazo.' using errcode = '42501';
  end if;
  select * into v from public.vendas where id = _venda_id for update;
  if v.id is null or v.tipo <> 'pedido' then raise exception 'Pedido não encontrado.'; end if;
  if v.status = 'Cancelado' then raise exception 'Pedido cancelado não pede prazo.'; end if;
  if exists (select 1 from public.pedido_prazos where venda_id = v.id and status = 'aguardando') then
    raise exception 'Já existe um pedido de prazo aguardando o PCP.';
  end if;
  if _data_desejada is not null and _data_desejada < current_date then
    raise exception 'A data desejada já passou.';
  end if;

  insert into public.pedido_prazos (venda_id, data_desejada, observacao, solicitado_por,
                                    solicitado_por_nome)
  values (v.id, _data_desejada, v_obs, auth.uid(), public.current_display_name())
  returning id into v_id;

  select nome into v_cliente from public.cadastros where id = v.cadastro_id;
  perform public.avisar(public.pessoas_com_funcao(array['pcp']), 'prazo_solicitado',
    '/comercial/' || v.id, v.numero, v_cliente,
    concat_ws(' · ',
      case when _data_desejada is not null then 'Desejado: ' || to_char(_data_desejada, 'DD/MM/YYYY') end,
      nullif(v_obs, '')));
  return v_id;
end $$;
revoke execute on function public.solicitar_prazo(uuid, date, text) from public, anon;
grant execute on function public.solicitar_prazo(uuid, date, text) to authenticated;

-- PCP/gestão dão o prazo. Quem decide é sempre o PCP.
create or replace function public.responder_prazo(_id uuid, _prazo date, _resposta text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.pedido_prazos;
  v public.vendas;
  v_cliente text;
  v_resp text := btrim(coalesce(_resposta, ''));
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só o PCP e a gestão dão o prazo.' using errcode = '42501';
  end if;
  select * into p from public.pedido_prazos where id = _id for update;
  if p.id is null then raise exception 'Pedido de prazo não encontrado.'; end if;
  if p.status <> 'aguardando' then raise exception 'Este pedido de prazo já foi respondido ou cancelado.'; end if;
  if _prazo is null then raise exception 'Informe a data do prazo.'; end if;
  if _prazo < current_date then raise exception 'O prazo não pode ser uma data que já passou.'; end if;

  update public.pedido_prazos
     set status = 'respondido', prazo = _prazo, resposta = v_resp, respondido_por = auth.uid(),
         respondido_por_nome = public.current_display_name(), respondido_em = now()
   where id = p.id;

  select * into v from public.vendas where id = p.venda_id;
  select nome into v_cliente from public.cadastros where id = v.cadastro_id;
  perform public.avisar(array[p.solicitado_por], 'prazo_definido', '/comercial/' || v.id,
    v.numero, v_cliente,
    concat_ws(' · ', 'Prazo: ' || to_char(_prazo, 'DD/MM/YYYY'), nullif(v_resp, '')));
end $$;
revoke execute on function public.responder_prazo(uuid, date, text) from public, anon;
grant execute on function public.responder_prazo(uuid, date, text) to authenticated;

-- Quem pediu, ou a gestão, cancela um pedido de prazo ainda aberto (ex.: pedido errado).
create or replace function public.cancelar_prazo(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.pedido_prazos;
begin
  select * into p from public.pedido_prazos where id = _id for update;
  if p.id is null then raise exception 'Pedido de prazo não encontrado.'; end if;
  if not (public.has_any_role(auth.uid(), array['gestor'])
          or (p.solicitado_por = auth.uid() and public.can_vender(auth.uid()))) then
    raise exception 'Só quem pediu ou a gestão cancelam o pedido de prazo.' using errcode = '42501';
  end if;
  if p.status <> 'aguardando' then raise exception 'Este pedido de prazo já foi respondido ou cancelado.'; end if;
  update public.pedido_prazos set status = 'cancelado' where id = p.id;
end $$;
revoke execute on function public.cancelar_prazo(uuid) from public, anon;
grant execute on function public.cancelar_prazo(uuid) to authenticated;
