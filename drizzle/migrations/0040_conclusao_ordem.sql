-- Fluxo de produção, etapa 7 (docs/fluxo-producao-plano.md): conclusão com conferência e cliente.
--   Montagem/produção dá baixa na última etapa → "Aguardando conferência" (aviso ao PCP)
--   → PCP confere: conferido → "Aguardando cliente" (aviso ao comercial); refazer (com motivo)
--     → "Em andamento" e a última etapa volta a ficar aberta
--   → comercial registra a confirmação do cliente (data, quem confirmou) → "Concluída".
--   Ordem sem pedido: conferida já fica "Concluída" (não há cliente para confirmar).
--   Quando todas as ordens do pedido estão concluídas (canceladas não contam), o pedido vira
--   "Concluído".
-- A passagem para "Aguardando conferência" é feita por gatilho nas etapas, para valer qualquer
-- que seja a função que dá baixa (a etapa 6, 0039, refaz as funções das etapas). Reabrir uma
-- etapa de uma ordem que esperava conferência ou cliente volta a ordem para "Em andamento".
-- Depende de 0019, 0035 e 0036. Não redefine nenhuma função de etapas nem salvar_ordem_producao.

-- ---------- 1) Situações e registro da conclusão ----------
alter table public.ordens_producao drop constraint if exists ordens_producao_status_check;
alter table public.ordens_producao add constraint ordens_producao_status_check
  check (status in ('Aguardando liberação', 'Aguardando', 'Em andamento', 'Aguardando conferência',
                    'Aguardando cliente', 'Concluída', 'Cancelada'));

alter table public.ordens_producao
  add column if not exists conferido_em timestamptz,
  add column if not exists conferido_por uuid references auth.users (id) on delete set null,
  add column if not exists conferido_por_nome text not null default '',
  add column if not exists cliente_confirmou_em date,
  add column if not exists cliente_confirmou_nome text not null default '',
  add column if not exists cliente_observacao text not null default '',
  add column if not exists cliente_registrado_por uuid references auth.users (id) on delete set null,
  add column if not exists cliente_registrado_por_nome text not null default '',
  add column if not exists cliente_registrado_em timestamptz;

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
                  'prazo_solicitado', 'prazo_definido',
                  'liberacao_pedido_alterado',
                  'ordem_conferencia', 'ordem_aguardando_cliente'));

-- ---------- 2) Última baixa → conferência; etapa reaberta → em andamento ----------
create or replace function public.ordem_etapas_conclusao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.ordens_producao%rowtype;
begin
  select * into o from public.ordens_producao where id = new.ordem_id for update;
  if not found then return null; end if;

  if new.concluido and o.status in ('Aguardando', 'Em andamento')
     and not exists (select 1 from public.ordens_producao_etapas where ordem_id = o.id and not concluido) then
    update public.ordens_producao set status = 'Aguardando conferência', data_inicio = coalesce(data_inicio, now())
    where id = o.id;
    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    values (o.id, 'status', format('Todas as etapas concluídas: situação alterada de %s para Aguardando conferência', o.status));
    perform public.avisar(public.pessoas_com_funcao(array['pcp']), 'ordem_conferencia', '/producao/' || o.id,
      o.numero::integer, (select nome from public.cadastros where id = o.cadastro_id), o.descricao);
  elsif not new.concluido and o.status in ('Aguardando conferência', 'Aguardando cliente') then
    update public.ordens_producao set status = 'Em andamento',
      conferido_em = null, conferido_por = null, conferido_por_nome = ''
    where id = o.id;
    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    values (o.id, 'status', format('Etapa reaberta (%s): situação alterada de %s para Em andamento', new.nome, o.status));
  end if;
  return null;
end;
$$;
revoke all on function public.ordem_etapas_conclusao() from public, anon, authenticated;

drop trigger if exists etapas_conclusao_ordem on public.ordens_producao_etapas;
create trigger etapas_conclusao_ordem after update of concluido on public.ordens_producao_etapas
  for each row when (new.concluido is distinct from old.concluido)
  execute function public.ordem_etapas_conclusao();

-- ---------- 3) PCP confere ----------
create or replace function public.conferir_ordem_producao(ordem_uuid uuid, conferida boolean, motivo text default '')
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.ordens_producao%rowtype;
  v_novo text;
  v_destinos uuid[];
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP conferem ordens de produção' using errcode = '42501';
  end if;
  select * into o from public.ordens_producao where id = ordem_uuid for update;
  if not found then raise exception 'Ordem não encontrada'; end if;
  if o.status <> 'Aguardando conferência' then raise exception 'Esta ordem não está aguardando conferência'; end if;

  if not conferida then
    if btrim(coalesce(motivo, '')) = '' then raise exception 'Informe o que precisa ser refeito'; end if;
    update public.ordens_producao set status = 'Em andamento' where id = o.id;
    -- A última etapa volta a ficar aberta: a equipe refaz e dá baixa de novo.
    update public.ordens_producao_etapas set concluido = false, concluido_em = null,
      concluido_por = null, concluido_por_nome = ''
    where id = (select id from public.ordens_producao_etapas where ordem_id = o.id order by ordem desc limit 1);
    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    values (o.id, 'conferencia', 'Conferência: refazer — ' || btrim(motivo));
    return 'Em andamento';
  end if;

  v_novo := case when o.venda_id is null then 'Concluída' else 'Aguardando cliente' end;
  update public.ordens_producao set status = v_novo,
    conferido_em = now(), conferido_por = auth.uid(), conferido_por_nome = public.current_display_name(),
    data_conclusao = case when v_novo = 'Concluída' then now() else data_conclusao end
  where id = o.id;
  insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
  values (o.id, 'conferencia', format('Conferida pelo PCP: situação alterada para %s', v_novo));

  if v_novo = 'Aguardando cliente' then
    select array_remove(array[
             (select created_by from public.liberacoes where id = o.liberacao_id),
             (select created_by from public.vendas where id = o.venda_id)], null)
      into v_destinos;
    if cardinality(v_destinos) = 0 then v_destinos := public.pessoas_com_funcao(array['comercial']); end if;
    perform public.avisar(v_destinos, 'ordem_aguardando_cliente', '/producao/' || o.id, o.numero::integer,
      (select nome from public.cadastros where id = o.cadastro_id), o.descricao);
  end if;
  return v_novo;
end;
$$;
revoke all on function public.conferir_ordem_producao(uuid, boolean, text) from public, anon;
grant execute on function public.conferir_ordem_producao(uuid, boolean, text) to authenticated;

-- ---------- 4) Comercial registra a confirmação do cliente ----------
create or replace function public.confirmar_cliente_ordem(
  ordem_uuid uuid, _data date, _quem text, _observacao text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.ordens_producao%rowtype;
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só comercial e gestão registram a confirmação do cliente' using errcode = '42501';
  end if;
  select * into o from public.ordens_producao where id = ordem_uuid for update;
  if not found then raise exception 'Ordem não encontrada'; end if;
  if o.status <> 'Aguardando cliente' then raise exception 'Esta ordem não está aguardando o cliente'; end if;
  if _data is null then raise exception 'Informe a data da confirmação'; end if;
  if _data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data da confirmação não pode ser futura';
  end if;
  if btrim(coalesce(_quem, '')) = '' then raise exception 'Informe quem confirmou no cliente'; end if;

  update public.ordens_producao set status = 'Concluída', data_conclusao = now(),
    cliente_confirmou_em = _data, cliente_confirmou_nome = btrim(_quem),
    cliente_observacao = btrim(coalesce(_observacao, '')),
    cliente_registrado_por = auth.uid(), cliente_registrado_por_nome = public.current_display_name(),
    cliente_registrado_em = now()
  where id = o.id;
  insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
  values (o.id, 'cliente', format('Cliente confirmou em %s (%s): situação alterada para Concluída',
    to_char(_data, 'DD/MM/YYYY'), btrim(_quem)));
end;
$$;
revoke all on function public.confirmar_cliente_ordem(uuid, date, text, text) from public, anon;
grant execute on function public.confirmar_cliente_ordem(uuid, date, text, text) to authenticated;

-- ---------- 5) Todas as ordens concluídas → pedido concluído ----------
create or replace function public.pedido_concluido_pelas_ordens()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.venda_id is not null and not exists (
    select 1 from public.ordens_producao
    where venda_id = new.venda_id and status not in ('Concluída', 'Cancelada')
  ) then
    update public.vendas set status = 'Concluído'
    where id = new.venda_id and tipo = 'pedido' and status in ('Aberto', 'Em andamento');
  end if;
  return null;
end;
$$;
revoke all on function public.pedido_concluido_pelas_ordens() from public, anon, authenticated;

drop trigger if exists ordens_conclui_pedido on public.ordens_producao;
create trigger ordens_conclui_pedido after update of status on public.ordens_producao
  for each row when (new.status = 'Concluída' and old.status is distinct from 'Concluída')
  execute function public.pedido_concluido_pelas_ordens();
