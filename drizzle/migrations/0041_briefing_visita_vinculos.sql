-- Fluxo de produção, etapa 10 (docs/fluxo-producao-plano.md): briefing e visita técnica ligados ao
-- pedido ou à ordem.
--   * briefings e visitas ganham venda_id (proposta ou pedido) e ordem_id, os dois opcionais.
--   * Ligar ou desligar é feito por vincular_briefing_visita (pelo número do briefing/visita):
--     briefing → comercial, gestão ou PCP; visita → comercial, gestão ou PCP. Vale também para os já
--     concluídos/realizados (ligar não muda o conteúdo). O app não grava essas colunas direto,
--     exceto ao criar (gatilho guard_vinculo_briefing_visita).
--   * Ligado só à ordem, herda o pedido dela. Ligado aos dois, a ordem tem de ser desse pedido (ou
--     da proposta que virou esse pedido).
--   * vinculados_briefing_visita(venda, ordem) lista o que aparece no pedido e na ordem: o que foi
--     ligado ao pedido, à proposta de onde ele veio ("feito antes do pedido") e às ordens dele.
-- Depende de 0010 (briefings, visitas), 0020 (vendas), 0036 (ordens da liberação).

-- ---------- 1) Colunas ----------
alter table public.briefings
  add column if not exists venda_id uuid references public.vendas (id) on delete set null,
  add column if not exists ordem_id uuid references public.ordens_producao (id) on delete set null;
alter table public.visitas
  add column if not exists venda_id uuid references public.vendas (id) on delete set null,
  add column if not exists ordem_id uuid references public.ordens_producao (id) on delete set null;
create index if not exists briefings_venda_idx on public.briefings (venda_id) where venda_id is not null;
create index if not exists briefings_ordem_idx on public.briefings (ordem_id) where ordem_id is not null;
create index if not exists visitas_venda_idx on public.visitas (venda_id) where venda_id is not null;
create index if not exists visitas_ordem_idx on public.visitas (ordem_id) where ordem_id is not null;

-- ---------- 2) Coerência e quem muda ----------
create or replace function public.guard_vinculo_briefing_visita()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_venda_ordem uuid;
  v_proposta uuid;
begin
  if tg_op = 'UPDATE' then
    if (new.venda_id, new.ordem_id) is not distinct from (old.venda_id, old.ordem_id) then return new; end if;
    if coalesce(current_setting('app.vinculo', true), '') <> 'on' then
      raise exception 'Use "Ligar ao pedido ou à ordem" para mudar o vínculo.';
    end if;
  end if;
  if new.venda_id is not null and not exists (select 1 from public.vendas where id = new.venda_id) then
    raise exception 'Pedido ou proposta não encontrado';
  end if;
  if new.ordem_id is not null then
    select venda_id into v_venda_ordem from public.ordens_producao where id = new.ordem_id;
    if not found then raise exception 'Ordem de produção não encontrada'; end if;
    if new.venda_id is null then
      new.venda_id := v_venda_ordem;
    elsif v_venda_ordem is not null and new.venda_id <> v_venda_ordem then
      select proposta_id into v_proposta from public.vendas where id = v_venda_ordem;
      if v_proposta is distinct from new.venda_id then
        raise exception 'A ordem é de outro pedido';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_vinculo_briefing_visita() from public, anon, authenticated;

drop trigger if exists briefings_vinculo on public.briefings;
create trigger briefings_vinculo before insert or update of venda_id, ordem_id on public.briefings
  for each row execute function public.guard_vinculo_briefing_visita();
drop trigger if exists visitas_vinculo on public.visitas;
create trigger visitas_vinculo before insert or update of venda_id, ordem_id on public.visitas
  for each row execute function public.guard_vinculo_briefing_visita();

-- ---------- 3) Ligar / desligar ----------
-- p_venda e p_ordem nulos desligam. Retorna o id do briefing/visita.
create or replace function public.vincular_briefing_visita(p_tipo text, p_numero integer, p_venda uuid, p_ordem uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if p_tipo = 'briefing' then
    if not (public.can_criar_briefing(auth.uid()) or public.can_gerir_operacao(auth.uid())) then
      raise exception 'Só comercial, PCP e gestão ligam briefings' using errcode = '42501';
    end if;
    select id into v_id from public.briefings where numero = p_numero;
    if not found then raise exception 'Briefing nº % não encontrado', p_numero; end if;
    perform set_config('app.vinculo', 'on', true);
    update public.briefings set venda_id = p_venda, ordem_id = p_ordem where id = v_id;
  elsif p_tipo = 'visita' then
    if not (public.can_solicitar_visita(auth.uid()) or public.can_agendar_visita(auth.uid())) then
      raise exception 'Só comercial, PCP e gestão ligam visitas técnicas' using errcode = '42501';
    end if;
    select id into v_id from public.visitas where numero = p_numero;
    if not found then raise exception 'Visita técnica nº % não encontrada', p_numero; end if;
    perform set_config('app.vinculo', 'on', true);
    update public.visitas set venda_id = p_venda, ordem_id = p_ordem where id = v_id;
  else
    raise exception 'Tipo inválido';
  end if;
  perform set_config('app.vinculo', 'off', true);
  return v_id;
end;
$$;
revoke all on function public.vincular_briefing_visita(text, integer, uuid, uuid) from public, anon;
grant execute on function public.vincular_briefing_visita(text, integer, uuid, uuid) to authenticated;

-- ---------- 4) O que aparece no pedido e na ordem ----------
-- Pedido: o ligado a ele, à proposta de onde veio e às ordens dele.
-- Ordem: o ligado a ela, ao pedido dela e à proposta desse pedido.
-- security invoker: a leitura segue o RLS (equipe aprovada).
create or replace function public.vinculados_briefing_visita(p_venda uuid, p_ordem uuid)
returns table (
  tipo text, id uuid, numero integer, titulo text, cliente text, status text,
  venda_id uuid, ordem_id uuid, created_at timestamptz
) language sql stable security invoker set search_path = public, pg_temp as $$
  with pedido as (
    select coalesce(p_venda, (select o.venda_id from public.ordens_producao o where o.id = p_ordem)) as id
  ), vendas_alvo as (
    select p.id from pedido p where p.id is not null
    union select v.proposta_id from public.vendas v join pedido p on v.id = p.id where v.proposta_id is not null
  ), ordens_alvo as (
    select p_ordem as id where p_ordem is not null
    union select o.id from public.ordens_producao o where p_venda is not null and o.venda_id = p_venda
  )
  select 'briefing', b.id, b.numero, b.titulo, b.cliente, b.status, b.venda_id, b.ordem_id, b.created_at
  from public.briefings b
  where b.venda_id in (select id from vendas_alvo) or b.ordem_id in (select id from ordens_alvo)
  union all
  select 'visita', v.id, v.numero, coalesce(nullif(v.descricao, ''), 'Visita técnica'), v.cliente, v.status,
    v.venda_id, v.ordem_id, v.created_at
  from public.visitas v
  where v.venda_id in (select id from vendas_alvo) or v.ordem_id in (select id from ordens_alvo)
  order by created_at;
$$;
revoke all on function public.vinculados_briefing_visita(uuid, uuid) from public, anon;
grant execute on function public.vinculados_briefing_visita(uuid, uuid) to authenticated;
