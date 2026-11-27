-- Fluxo do orçamento (fluxograma "Fluxo comercial — do orçamento à produção", 27/11/2026):
--   Cliente pede → Comercial faz o briefing → Projetos levanta materiais e precifica (composição
--   de custo, 0050) → Gestão fecha o orçamento (aprova preço e margem) ou devolve para Projetos
--   revisar → Comercial envia ao cliente → cliente aprova (gera pedido e liberação) ou pede ajuste
--   (volta para Projetos, nova revisão) ou recusa (Perdido = Recusada).
-- No banco:
--   * vendas.orcamento_situacao (null = proposta fora do fluxo, como antes):
--       em_orcamento → aguardando_aprovacao → aprovado (fechado) | devolvido → aguardando…
--     Muda só pelas funções abaixo (gatilho guard_orcamento_vendas).
--   * A proposta no fluxo só fica Enviada ou Aprovada (e só vira pedido) depois de fechada.
--   * Enquanto em_orcamento/devolvido, Projetos Especiais edita os itens (salvar_venda) e a
--     composição; não muda situação, cliente, empresa nem vendedor. Aguardando aprovação ou
--     fechado: itens, valores e composição ficam travados (para mudar, "Cliente pediu ajuste").
--   * orcamento_revisoes: cada envio para a Gestão é uma revisão (R1, R2…) com a foto dos itens,
--     da composição, do custo e do valor, e a decisão (fechado/devolvido + motivo).
--   * Avisos: orcamento_aprovacao (Gestão/Direção), orcamento_aprovado (Comercial),
--     orcamento_devolvido e orcamento_ajuste (Projetos).
-- Depende de 0010 (briefings, avisar), 0020/0034/0038 (vendas, salvar_venda), 0041, 0048–0050.
-- Pode rodar mais de uma vez.

-- ---------- 1) Colunas e revisões ----------
alter table public.vendas
  add column if not exists orcamento_situacao text
    check (orcamento_situacao in ('em_orcamento', 'aguardando_aprovacao', 'devolvido', 'aprovado')),
  add column if not exists orcamento_revisao integer not null default 0;

create table if not exists public.orcamento_revisoes (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  numero integer not null,
  custo numeric(14,2) not null default 0,
  valor numeric(14,2) not null default 0,
  foto jsonb not null default '{}',
  enviada_por uuid references auth.users (id) on delete set null,
  enviada_por_nome text not null default '',
  enviada_em timestamptz not null default now(),
  decisao text check (decisao in ('aprovado', 'devolvido')),
  decidido_por_nome text,
  decidido_em timestamptz,
  motivo text,
  ajuste_motivo text,
  unique (venda_id, numero)
);
alter table public.orcamento_revisoes enable row level security;
revoke all on public.orcamento_revisoes from public, anon;
grant select on public.orcamento_revisoes to authenticated;
grant all on public.orcamento_revisoes to service_role;
drop policy if exists orcamento_revisoes_select on public.orcamento_revisoes;
create policy orcamento_revisoes_select on public.orcamento_revisoes for select to authenticated
  using (estoque.pode_ver_custo(auth.uid()));

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
                  'ordem_conferencia', 'ordem_aguardando_cliente',
                  'orcamento_aprovacao', 'orcamento_aprovado', 'orcamento_devolvido',
                  'orcamento_ajuste'));

-- ---------- 2) Quem edita ----------
-- Comercial/Gestão sempre; Projetos Especiais só na proposta em orçamento (ou devolvida).
create or replace function public.pode_editar_venda(_user_id uuid, _venda uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_vender(_user_id)
    or (public.has_any_role(_user_id, array['projetos_especiais'])
        and exists (select 1 from public.vendas v where v.id = _venda and v.tipo = 'proposta'
                    and v.orcamento_situacao in ('em_orcamento', 'devolvido')))
$$;
revoke execute on function public.pode_editar_venda(uuid, uuid) from public, anon;
grant execute on function public.pode_editar_venda(uuid, uuid) to authenticated, service_role;

drop policy if exists vendas_update on public.vendas;
create policy vendas_update on public.vendas for update to authenticated
  using (public.pode_editar_venda(auth.uid(), id)) with check (public.pode_editar_venda(auth.uid(), id));
drop policy if exists vendas_itens_insert on public.vendas_itens;
drop policy if exists vendas_itens_update on public.vendas_itens;
drop policy if exists vendas_itens_delete on public.vendas_itens;
create policy vendas_itens_insert on public.vendas_itens for insert to authenticated
  with check (public.pode_editar_venda(auth.uid(), venda_id));
create policy vendas_itens_update on public.vendas_itens for update to authenticated
  using (public.pode_editar_venda(auth.uid(), venda_id))
  with check (public.pode_editar_venda(auth.uid(), venda_id));
create policy vendas_itens_delete on public.vendas_itens for delete to authenticated
  using (public.pode_editar_venda(auth.uid(), venda_id));

-- ---------- 3) Travas ----------
-- As travas valem para quem usa o app (papel authenticated); o dono do banco e o service_role
-- (cargas, correções) passam.
create or replace function public.chamada_do_app()
returns boolean language sql stable as $$
  select coalesce(current_setting('role', true), '') = 'authenticated'
$$;

create or replace function public.guard_orcamento_vendas()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.chamada_do_app() then return new; end if;
  if (new.orcamento_situacao, new.orcamento_revisao) is distinct from (old.orcamento_situacao, old.orcamento_revisao)
     and coalesce(current_setting('app.orcamento', true), '') <> 'on' then
    raise exception 'A situação do orçamento muda só pelos botões do fluxo.' using errcode = '42501';
  end if;
  if new.tipo = 'proposta' and new.orcamento_situacao is not null and new.orcamento_situacao <> 'aprovado'
     and new.status in ('Enviada', 'Aprovada') and new.status is distinct from old.status then
    raise exception 'O orçamento ainda não foi fechado pela Gestão: não dá para enviar nem aprovar.'
      using errcode = '23514';
  end if;
  if not public.can_vender(auth.uid()) and auth.uid() is not null
     and coalesce(current_setting('app.orcamento', true), '') <> 'on'
     and (new.status, new.cadastro_id, new.empresa_id, new.vendedor, new.desconto)
       is distinct from (old.status, old.cadastro_id, old.empresa_id, old.vendedor, old.desconto) then
    raise exception 'Projetos edita só os itens do orçamento; situação, cliente e desconto ficam com o Comercial.'
      using errcode = '42501';
  end if;
  if old.orcamento_situacao in ('aguardando_aprovacao', 'aprovado') and new.desconto is distinct from old.desconto
     and coalesce(current_setting('app.orcamento', true), '') <> 'on' then
    raise exception 'Orçamento fechado: para mudar o desconto, use "Cliente pediu ajuste".' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists guard_orcamento_vendas on public.vendas;
create trigger guard_orcamento_vendas before update on public.vendas
  for each row execute function public.guard_orcamento_vendas();

-- Itens travados enquanto aguardando aprovação ou fechado (só o que muda o preço ou o escopo).
create or replace function public.guard_itens_orcamento()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sit text; v_venda uuid := coalesce(new.venda_id, old.venda_id);
begin
  if coalesce(current_setting('app.orcamento', true), '') = 'on' or not public.chamada_do_app() then
    return coalesce(new, old);
  end if;
  select orcamento_situacao into v_sit from public.vendas where id = v_venda;
  if v_sit in ('aguardando_aprovacao', 'aprovado') and (
       tg_op <> 'UPDATE'
       or (new.descricao, new.categoria, new.quantidade, new.valor_unitario, new.desconto)
          is distinct from (old.descricao, old.categoria, old.quantidade, old.valor_unitario, old.desconto)) then
    raise exception 'Orçamento % pela Gestão: os itens ficam travados. Para mudar, use "Cliente pediu ajuste".',
      case v_sit when 'aprovado' then 'fechado' else 'aguardando aprovação' end using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_itens_orcamento on public.vendas_itens;
create trigger guard_itens_orcamento before insert or update or delete on public.vendas_itens
  for each row execute function public.guard_itens_orcamento();

-- Composição travada do mesmo jeito.
create or replace function estoque.orcamento_travado(_venda_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select v.orcamento_situacao in ('aguardando_aprovacao', 'aprovado')
    from public.vendas_itens vi join public.vendas v on v.id = vi.venda_id where vi.id = _venda_item), false)
$$;

-- ---------- 4) salvar_venda: Projetos edita a proposta em orçamento ----------
-- Igual à da 0038; só a permissão muda (criar continua só Comercial/Gestão).
create or replace function public.salvar_venda(dados jsonb, venda_uuid uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_tipo text;
  item jsonb;
  i integer := 0;
  v_item uuid;
  v_mantidos uuid[] := '{}';
  v_antes jsonb;
begin
  if venda_uuid is null and not public.can_vender(auth.uid()) then
    raise exception 'Só comercial e gestão criam propostas e pedidos' using errcode = '42501';
  end if;
  if venda_uuid is not null and not public.pode_editar_venda(auth.uid(), venda_uuid) then
    raise exception 'Só comercial e gestão alteram propostas e pedidos (Projetos, só o orçamento em andamento)'
      using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(dados->'itens', '[]'::jsonb)) = 0 then
    raise exception 'Inclua pelo menos um item';
  end if;
  if venda_uuid is null then
    insert into public.vendas (tipo, empresa_id, cadastro_id, vendedor, status, validade,
      condicoes_pagamento, observacao, desconto)
    values (dados->>'tipo', (dados->>'empresa_id')::uuid, (dados->>'cadastro_id')::uuid,
      nullif(btrim(dados->>'vendedor'), ''), dados->>'status', nullif(dados->>'validade', '')::date,
      nullif(btrim(dados->>'condicoes_pagamento'), ''), nullif(btrim(dados->>'observacao'), ''),
      coalesce((dados->>'desconto')::numeric, 0))
    returning id into v_id;
  else
    select tipo into v_tipo from public.vendas where id = venda_uuid for update;
    if not found then raise exception 'Documento não encontrado'; end if;
    if exists (select 1 from public.liberacoes where venda_id = venda_uuid) then
      v_antes := public.foto_pedido(venda_uuid);
    end if;
    update public.vendas set
      empresa_id = (dados->>'empresa_id')::uuid,
      cadastro_id = (dados->>'cadastro_id')::uuid,
      vendedor = nullif(btrim(dados->>'vendedor'), ''),
      status = dados->>'status',
      validade = case when v_tipo = 'proposta' then nullif(dados->>'validade', '')::date end,
      condicoes_pagamento = nullif(btrim(dados->>'condicoes_pagamento'), ''),
      observacao = nullif(btrim(dados->>'observacao'), ''),
      desconto = coalesce((dados->>'desconto')::numeric, 0)
    where id = venda_uuid
    returning id into v_id;

    select coalesce(array_agg(distinct vi.id), '{}') into v_mantidos
      from jsonb_array_elements(dados->'itens') e
      join public.vendas_itens vi
        on vi.venda_id = v_id
       and vi.id::text = nullif(e->>'id', '');
    delete from public.vendas_itens where venda_id = v_id and not (id = any (v_mantidos));
  end if;

  for item in select * from jsonb_array_elements(dados->'itens') loop
    i := i + 1;
    if coalesce(btrim(item->>'descricao'), '') = '' then
      raise exception 'Item % sem descrição', i;
    end if;
    v_item := null;
    if (nullif(item->>'id', '') is not null) and (item->>'id')::text = any (v_mantidos::text[]) then
      v_item := (item->>'id')::uuid;
      v_mantidos := array_remove(v_mantidos, v_item);
    end if;
    if v_item is not null then
      update public.vendas_itens set
        ordem = i,
        categoria = item->>'categoria',
        descricao = btrim(item->>'descricao'),
        ponto = nullif(btrim(item->>'ponto'), ''),
        periodo_inicio = nullif(item->>'periodo_inicio', '')::date,
        periodo_fim = nullif(item->>'periodo_fim', '')::date,
        quantidade = coalesce((item->>'quantidade')::numeric, 1),
        valor_unitario = coalesce((item->>'valor_unitario')::numeric, 0),
        desconto = coalesce((item->>'desconto')::numeric, 0)
      where id = v_item;
    else
      insert into public.vendas_itens (venda_id, ordem, categoria, descricao, ponto, periodo_inicio,
        periodo_fim, quantidade, valor_unitario, desconto)
      values (v_id, i, item->>'categoria', btrim(item->>'descricao'), nullif(btrim(item->>'ponto'), ''),
        nullif(item->>'periodo_inicio', '')::date, nullif(item->>'periodo_fim', '')::date,
        coalesce((item->>'quantidade')::numeric, 1), coalesce((item->>'valor_unitario')::numeric, 0),
        coalesce((item->>'desconto')::numeric, 0));
    end if;
  end loop;

  if v_antes is not null then
    perform public.registrar_alteracao_pedido(v_id, v_antes);
  end if;
  return v_id;
end;
$$;
revoke all on function public.salvar_venda(jsonb, uuid) from public, anon;
grant execute on function public.salvar_venda(jsonb, uuid) to authenticated;

-- ---------- 5) Composição respeita a trava ----------
create or replace function estoque.exigir_orcamento_aberto(_venda_item uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if estoque.orcamento_travado(_venda_item) then
    raise exception 'Orçamento enviado ou fechado pela Gestão: a composição fica travada. Para mudar, use "Cliente pediu ajuste".'
      using errcode = '23514';
  end if;
end $$;

create or replace function estoque.trava_composicao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.orcamento', true), '') <> 'on' and public.chamada_do_app() then
    perform estoque.exigir_orcamento_aberto(coalesce(new.venda_item_id, old.venda_item_id));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trava_composicao on estoque.materiais_item;
create trigger trava_composicao before insert or update or delete on estoque.materiais_item
  for each row execute function estoque.trava_composicao();
drop trigger if exists trava_composicao on public.vendas_itens_custos;
create trigger trava_composicao before insert or update or delete on public.vendas_itens_custos
  for each row execute function estoque.trava_composicao();

-- ---------- 6) Funções do fluxo ----------
create or replace function public.orcamento_destinos(_roles text[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct user_id), '{}') from public.user_roles where role::text = any (_roles)
$$;

-- Quem fez o briefing (ou criou a proposta): o Comercial do orçamento.
create or replace function public.orcamento_comercial(_venda uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u) filter (where u is not null), '{}') from (
    select b.created_by as u from public.briefings b where b.venda_id = _venda
    union select v.created_by from public.vendas v where v.id = _venda
  ) x
$$;

-- Foto da proposta para a revisão: itens, composição, custo e valor.
create or replace function public.orcamento_foto(_venda uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', vi.id, 'ordem', vi.ordem,
        'descricao', vi.descricao, 'quantidade', vi.quantidade, 'valor_unitario', vi.valor_unitario,
        'desconto', vi.desconto,
        'materiais', coalesce((select jsonb_agg(jsonb_build_object('produto', p.codigo || ' ' || p.nome,
            'secao', m.secao, 'quantidade', m.quantidade, 'valor_unitario', m.valor_unitario) order by m.ordem)
          from estoque.materiais_item m join estoque.produtos p on p.id = m.produto_id
          where m.venda_item_id = vi.id), '[]'),
        'custos', coalesce((select jsonb_agg(jsonb_build_object('descricao', c.descricao, 'secao', c.secao,
            'unidade', c.unidade, 'quantidade', c.quantidade, 'valor_unitario', c.valor_unitario) order by c.ordem)
          from public.vendas_itens_custos c where c.venda_item_id = vi.id), '[]'))
      order by vi.ordem) from public.vendas_itens vi where vi.venda_id = _venda), '[]'),
    'desconto', (select desconto from public.vendas where id = _venda))
$$;

create or replace function public.orcamento_custo(_venda uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(
    coalesce((select sum(m.quantidade * coalesce(m.valor_unitario, 0)) from estoque.materiais_item m
      join public.vendas_itens vi on vi.id = m.venda_item_id where vi.venda_id = _venda), 0)
    + coalesce((select sum(c.quantidade * c.valor_unitario) from public.vendas_itens_custos c
      join public.vendas_itens vi on vi.id = c.venda_item_id where vi.venda_id = _venda), 0), 2)
$$;

create or replace function public.orcamento_valor(_venda uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(greatest(coalesce((select sum(vi.quantidade * vi.valor_unitario - vi.desconto)
    from public.vendas_itens vi where vi.venda_id = _venda), 0)
    - (select desconto from public.vendas where id = _venda), 0), 2)
$$;

-- Briefing de orçamento → proposta "em orçamento" (Projetos, Comercial ou Gestão).
create or replace function public.criar_orcamento_briefing(_briefing uuid, _cadastro uuid, _empresa uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.briefings; v_id uuid;
begin
  if not public.has_any_role(auth.uid(), array['gestor', 'direcao', 'comercial', 'projetos_especiais']) then
    raise exception 'Sem permissão para criar o orçamento.' using errcode = '42501';
  end if;
  select * into b from public.briefings where id = _briefing for update;
  if not found then raise exception 'Briefing não encontrado.' using errcode = 'P0002'; end if;
  if b.destino <> 'projetos_especiais' then
    raise exception 'Só o briefing de orçamento (Projetos Especiais) vira orçamento.' using errcode = '22023';
  end if;
  if b.venda_id is not null then
    raise exception 'Este briefing já tem orçamento.' using errcode = '23505';
  end if;
  if not exists (select 1 from public.cadastros where id = _cadastro) then
    raise exception 'Escolha o cliente.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.empresas where id = _empresa) then
    raise exception 'Escolha a empresa.' using errcode = '22023';
  end if;
  perform set_config('app.orcamento', 'on', true);
  insert into public.vendas (tipo, empresa_id, cadastro_id, vendedor, status, observacao,
    orcamento_situacao, created_by)
  values ('proposta', _empresa, _cadastro, nullif(btrim(b.vendedor), ''), 'Rascunho',
    nullif(btrim(concat_ws(E'\n', b.titulo, nullif(b.descricao, ''))), ''), 'em_orcamento',
    coalesce(b.created_by, auth.uid()))
  returning id into v_id;
  insert into public.vendas_itens (venda_id, ordem, categoria, descricao, quantidade)
  values (v_id, 1, 'Produção', b.titulo, 1);
  perform set_config('app.vinculo', 'on', true);
  update public.briefings set venda_id = v_id where id = _briefing;
  perform set_config('app.vinculo', 'off', true);
  perform set_config('app.orcamento', 'off', true);
  return v_id;
end $$;

-- Proposta que já existe entra no fluxo (Comercial manda para Projetos orçar).
create or replace function public.iniciar_orcamento(_venda uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.vendas;
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só Comercial e Gestão mandam a proposta para Projetos.' using errcode = '42501';
  end if;
  select * into v from public.vendas where id = _venda for update;
  if not found or v.tipo <> 'proposta' then raise exception 'Proposta não encontrada.' using errcode = 'P0002'; end if;
  if v.orcamento_situacao is not null then raise exception 'Esta proposta já está no fluxo do orçamento.'; end if;
  if v.status <> 'Rascunho' then raise exception 'Só uma proposta em Rascunho vai para orçamento.'; end if;
  perform set_config('app.orcamento', 'on', true);
  update public.vendas set orcamento_situacao = 'em_orcamento' where id = _venda;
  perform set_config('app.orcamento', 'off', true);
  perform public.avisar(public.orcamento_destinos(array['projetos_especiais']), 'orcamento_ajuste',
    '/comercial/' || _venda, v.numero, (select nome from public.cadastros where id = v.cadastro_id),
    'Nova proposta para orçar');
end $$;

-- Projetos termina: revisão nova e vai para a Gestão.
create or replace function public.enviar_orcamento_aprovacao(_venda uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.vendas; v_rev integer;
begin
  if not public.has_any_role(auth.uid(), array['gestor', 'direcao', 'projetos_especiais']) then
    raise exception 'Só Projetos (ou a Gestão) envia o orçamento para aprovação.' using errcode = '42501';
  end if;
  select * into v from public.vendas where id = _venda for update;
  if not found then raise exception 'Proposta não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v.orcamento_situacao, '') not in ('em_orcamento', 'devolvido') then
    raise exception 'O orçamento não está com Projetos.' using errcode = '22023';
  end if;
  if public.orcamento_valor(_venda) <= 0 then
    raise exception 'Coloque o preço nos itens antes de enviar (botão "Usar no item" da composição).'
      using errcode = '22023';
  end if;
  v_rev := v.orcamento_revisao + 1;
  insert into public.orcamento_revisoes (venda_id, numero, custo, valor, foto, enviada_por, enviada_por_nome)
  values (_venda, v_rev, public.orcamento_custo(_venda), public.orcamento_valor(_venda),
    public.orcamento_foto(_venda), auth.uid(), public.current_display_name());
  perform set_config('app.orcamento', 'on', true);
  update public.vendas set orcamento_situacao = 'aguardando_aprovacao', orcamento_revisao = v_rev
  where id = _venda;
  perform set_config('app.orcamento', 'off', true);
  perform public.avisar(public.orcamento_destinos(array['gestor', 'direcao']), 'orcamento_aprovacao',
    '/comercial/' || _venda, v.numero, (select nome from public.cadastros where id = v.cadastro_id),
    'Revisão ' || v_rev);
  return v_rev;
end $$;

-- Gestão fecha (aprova preço e margem) ou devolve para Projetos.
create or replace function public.decidir_orcamento(_venda uuid, _fechar boolean, _motivo text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.vendas; r public.orcamento_revisoes;
begin
  if not public.has_any_role(auth.uid(), array['gestor', 'direcao']) then
    raise exception 'Só a Gestão fecha ou devolve o orçamento.' using errcode = '42501';
  end if;
  select * into v from public.vendas where id = _venda for update;
  if not found then raise exception 'Proposta não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v.orcamento_situacao, '') <> 'aguardando_aprovacao' then
    raise exception 'O orçamento não está aguardando a Gestão.' using errcode = '22023';
  end if;
  if not _fechar and coalesce(btrim(_motivo), '') = '' then
    raise exception 'Escreva o motivo para Projetos revisar.' using errcode = '22023';
  end if;
  select * into r from public.orcamento_revisoes where venda_id = _venda and numero = v.orcamento_revisao;
  update public.orcamento_revisoes set decisao = case when _fechar then 'aprovado' else 'devolvido' end,
    decidido_por_nome = public.current_display_name(), decidido_em = now(),
    motivo = nullif(btrim(_motivo), '')
  where id = r.id;
  perform set_config('app.orcamento', 'on', true);
  update public.vendas set orcamento_situacao = case when _fechar then 'aprovado' else 'devolvido' end
  where id = _venda;
  perform set_config('app.orcamento', 'off', true);
  if _fechar then
    perform public.avisar(public.orcamento_comercial(_venda), 'orcamento_aprovado', '/comercial/' || _venda,
      v.numero, (select nome from public.cadastros where id = v.cadastro_id), 'Pode enviar ao cliente');
  else
    perform public.avisar(
      case when r.enviada_por is not null then array[r.enviada_por]
           else public.orcamento_destinos(array['projetos_especiais']) end,
      'orcamento_devolvido', '/comercial/' || _venda, v.numero,
      (select nome from public.cadastros where id = v.cadastro_id), btrim(_motivo));
  end if;
end $$;

-- Cliente pediu ajuste: volta para Projetos (a próxima ida à Gestão é uma revisão nova).
create or replace function public.pedir_ajuste_orcamento(_venda uuid, _motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.vendas; r public.orcamento_revisoes;
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só Comercial e Gestão registram o pedido de ajuste do cliente.' using errcode = '42501';
  end if;
  if coalesce(btrim(_motivo), '') = '' then
    raise exception 'Escreva o que o cliente quer ajustar.' using errcode = '22023';
  end if;
  select * into v from public.vendas where id = _venda for update;
  if not found then raise exception 'Proposta não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v.orcamento_situacao, '') <> 'aprovado' or v.status not in ('Rascunho', 'Enviada') then
    raise exception 'Só um orçamento fechado, ainda não aprovado pelo cliente, volta para ajuste.'
      using errcode = '22023';
  end if;
  select * into r from public.orcamento_revisoes where venda_id = _venda and numero = v.orcamento_revisao;
  update public.orcamento_revisoes set ajuste_motivo = btrim(_motivo) where id = r.id;
  perform set_config('app.orcamento', 'on', true);
  update public.vendas set orcamento_situacao = 'em_orcamento', status = 'Rascunho' where id = _venda;
  perform set_config('app.orcamento', 'off', true);
  perform public.avisar(
    case when r.enviada_por is not null then array[r.enviada_por]
         else public.orcamento_destinos(array['projetos_especiais']) end,
    'orcamento_ajuste', '/comercial/' || _venda, v.numero,
    (select nome from public.cadastros where id = v.cadastro_id), btrim(_motivo));
end $$;

-- salvar_composicao e aplicar_preco_item: mesmas da 0050 + trava do orçamento.
create or replace function estoque.aplicar_preco_item(_venda_item uuid, _valor_total numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qtd numeric; v_venda uuid; v_unit numeric;
begin
  if not (estoque.pode_listar_material(auth.uid()) or public.can_vender(auth.uid())) then
    raise exception 'Sem permissão para mudar o valor do item.' using errcode = '42501';
  end if;
  perform estoque.exigir_orcamento_aberto(_venda_item);
  if _valor_total is null or _valor_total < 0 then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;
  select quantidade, venda_id into v_qtd, v_venda from public.vendas_itens where id = _venda_item for update;
  if not found then raise exception 'Item não encontrado.' using errcode = 'P0002'; end if;
  v_unit := round(_valor_total / v_qtd, 2);
  update public.vendas_itens set valor_unitario = v_unit where id = _venda_item;
  perform set_config('app.orcamento', 'on', true);
  update public.vendas set updated_at = now() where id = v_venda;
  perform set_config('app.orcamento', 'off', true);
  return v_unit;
end $$;

revoke execute on function public.orcamento_destinos(text[]) from public, anon, authenticated;
revoke execute on function public.orcamento_comercial(uuid) from public, anon, authenticated;
revoke execute on function public.orcamento_foto(uuid) from public, anon, authenticated;
revoke execute on function public.orcamento_custo(uuid) from public, anon, authenticated;
revoke execute on function public.orcamento_valor(uuid) from public, anon, authenticated;
revoke execute on function estoque.orcamento_travado(uuid) from public, anon;
revoke execute on function estoque.exigir_orcamento_aberto(uuid) from public, anon;
grant execute on function estoque.orcamento_travado(uuid) to authenticated, service_role;
revoke execute on function public.criar_orcamento_briefing(uuid, uuid, uuid) from public, anon;
revoke execute on function public.iniciar_orcamento(uuid) from public, anon;
revoke execute on function public.enviar_orcamento_aprovacao(uuid) from public, anon;
revoke execute on function public.decidir_orcamento(uuid, boolean, text) from public, anon;
revoke execute on function public.pedir_ajuste_orcamento(uuid, text) from public, anon;
grant execute on function public.criar_orcamento_briefing(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.iniciar_orcamento(uuid) to authenticated, service_role;
grant execute on function public.enviar_orcamento_aprovacao(uuid) to authenticated, service_role;
grant execute on function public.decidir_orcamento(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.pedir_ajuste_orcamento(uuid, text) to authenticated, service_role;
grant execute on function estoque.aplicar_preco_item(uuid, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
