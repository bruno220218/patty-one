-- Fluxo de produção, etapa 6 (docs/fluxo-producao-plano.md): etapas da ordem a partir do checklist.
--   * A ordem guarda o checklist de onde vieram as etapas (ordens_producao.checklist_id) e, se o
--     checklist tem "Parâmetros fixos", fica com as etapas travadas (etapas_fixas): ninguém
--     acrescenta, tira, renomeia ou reordena etapas — a mesma regra dos projetos
--     (guard_project_tasks), aqui no gatilho guard_ordens_etapas.
--   * As etapas são copiadas do checklist pelo banco (como create_project): o app não manda os
--     nomes quando escolhe um checklist.
--   * Checklist padrão por tipo de ordem (Instalação / Impressão), escolhido por gestão e PCP em
--     Checklists. As ordens que nascem da liberação (etapa 4) usam esse padrão; sem padrão, as
--     etapas padrão do tipo, como antes.
--   * O PCP troca o checklist de uma ordem enquanto ela não começou (nenhuma etapa concluída e
--     nenhum tempo apontado) — na aprovação da liberação ou na própria ordem.
--   * Quem concluiu e quando já ficam na etapa (0019); agora só a gestão reabre uma etapa
--     concluída, como nas tarefas do projeto.
-- Mantém gerar_ordens_liberacao(uuid) com a mesma assinatura e as mesmas regras (a 0038 a usa
-- para itens novos), e não muda concluido nem os apontamentos (0035).
-- Depende de 0000 (checklists), 0024 (can_gerir_checklists), 0035 e 0036.

-- ---------- 1) Colunas ----------
alter table public.ordens_producao
  add column if not exists checklist_id uuid references public.checklists (id) on delete set null,
  add column if not exists etapas_fixas boolean not null default false;

-- ---------- 2) Checklist padrão por tipo de ordem ----------
create table if not exists public.ordens_checklist_padrao (
  tipo text primary key check (tipo in ('Instalação', 'Impressão')),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.ordens_checklist_padrao enable row level security;
revoke all on public.ordens_checklist_padrao from public, anon, authenticated;
grant select on public.ordens_checklist_padrao to authenticated;
grant all on public.ordens_checklist_padrao to service_role;
drop policy if exists equipe_le on public.ordens_checklist_padrao;
create policy equipe_le on public.ordens_checklist_padrao for select to authenticated
  using (public.is_team_member(auth.uid()));

-- null tira o padrão do tipo.
create or replace function public.definir_checklist_padrao(p_tipo text, p_checklist uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_gerir_checklists(auth.uid()) then
    raise exception 'Só Gestão e PCP escolhem o checklist padrão das ordens' using errcode = '42501';
  end if;
  if coalesce(p_tipo, '') not in ('Instalação', 'Impressão') then raise exception 'Tipo de ordem inválido'; end if;
  if p_checklist is null then
    delete from public.ordens_checklist_padrao where tipo = p_tipo;
    return;
  end if;
  if not exists (select 1 from public.checklist_tasks where checklist_id = p_checklist) then
    raise exception 'Escolha um checklist com pelo menos uma tarefa';
  end if;
  insert into public.ordens_checklist_padrao (tipo, checklist_id) values (p_tipo, p_checklist)
  on conflict (tipo) do update set checklist_id = excluded.checklist_id, updated_at = now();
end;
$$;
revoke all on function public.definir_checklist_padrao(text, uuid) from public, anon;
grant execute on function public.definir_checklist_padrao(text, uuid) to authenticated;

-- ---------- 3) Trava das etapas (parâmetros fixos) ----------
create or replace function public.guard_ordens_etapas()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fixas boolean;
begin
  if coalesce(current_setting('app.internal', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select etapas_fixas into v_fixas from public.ordens_producao
  where id = coalesce(new.ordem_id, old.ordem_id);
  -- Ordem já excluída (cascata) ou sem trava: segue.
  if not found or not v_fixas then return coalesce(new, old); end if;
  if tg_op in ('INSERT', 'DELETE')
     or new.nome is distinct from old.nome or new.ordem is distinct from old.ordem
     or new.ordem_id is distinct from old.ordem_id then
    raise exception 'Esta ordem tem parâmetros fixos: as etapas não podem ser alteradas.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_ordens_etapas() from public, anon, authenticated;
drop trigger if exists guard_ordens_etapas on public.ordens_producao_etapas;
create trigger guard_ordens_etapas before insert or update or delete on public.ordens_producao_etapas
  for each row execute function public.guard_ordens_etapas();

-- ---------- 4) Etapas de uma ordem (uso interno) ----------
-- As mesmas de ETAPAS_PADRAO em producao-rules.ts.
create or replace function public.etapas_padrao_tipo(p_tipo text)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select case when p_tipo = 'Instalação'
              then array['Preparação', 'Logística', 'Instalação', 'Conferência']
              else array['Arte e preparação', 'Impressão', 'Acabamento', 'Conferência'] end
$$;

-- Troca todas as etapas da ordem: as tarefas do checklist (em ordem) ou, sem checklist, os nomes
-- dados. Grava o checklist e a trava na ordem. Retorna quantas etapas ficaram.
create or replace function public.aplicar_etapas_ordem(p_ordem uuid, p_checklist uuid, p_nomes text[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fixas boolean := false;
  n integer;
begin
  if p_checklist is not null then
    select fixed_params into v_fixas from public.checklists where id = p_checklist;
    if not found then raise exception 'Checklist não encontrado'; end if;
  end if;
  perform set_config('app.internal', 'on', true);
  delete from public.ordens_producao_etapas where ordem_id = p_ordem;
  if p_checklist is not null then
    insert into public.ordens_producao_etapas (ordem_id, ordem, nome)
    select p_ordem, row_number() over (order by ct.position, ct.created_at), btrim(ct.title)
    from public.checklist_tasks ct where ct.checklist_id = p_checklist;
  else
    insert into public.ordens_producao_etapas (ordem_id, ordem, nome)
    select p_ordem, n2::integer, btrim(nome)
    from unnest(p_nomes) with ordinality as e(nome, n2)
    where btrim(coalesce(nome, '')) <> '';
  end if;
  get diagnostics n = row_count;
  perform set_config('app.internal', 'off', true);
  if n = 0 then raise exception 'A ordem precisa de pelo menos uma etapa (o checklist está vazio?)'; end if;
  update public.ordens_producao set checklist_id = p_checklist, etapas_fixas = coalesce(v_fixas, false)
  where id = p_ordem;
  return n;
end;
$$;
revoke all on function public.aplicar_etapas_ordem(uuid, uuid, text[]) from public, anon, authenticated;

-- A ordem começou: alguma etapa concluída ou algum tempo apontado.
create or replace function public.ordem_comecou(p_ordem uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.ordens_producao_etapas where ordem_id = p_ordem and concluido)
      or exists (select 1 from public.ordens_producao_apontamentos where ordem_id = p_ordem)
$$;
revoke all on function public.ordem_comecou(uuid) from public, anon, authenticated;

-- ---------- 5) Trocar o checklist de uma ordem ----------
-- null volta às etapas do serviço da ordem (ou às padrão do tipo).
create or replace function public.trocar_checklist_ordem(ordem_uuid uuid, checklist_uuid uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.ordens_producao%rowtype;
  v_nomes text[];
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP trocam as etapas da ordem' using errcode = '42501';
  end if;
  select * into o from public.ordens_producao where id = ordem_uuid for update;
  if not found then raise exception 'Ordem não encontrada'; end if;
  if o.status in ('Concluída', 'Cancelada') then raise exception 'Reabra a ordem antes de trocar as etapas'; end if;
  if o.checklist_id is not distinct from checklist_uuid then return; end if;
  if public.ordem_comecou(ordem_uuid) then
    raise exception 'A ordem já começou: as etapas não podem mais ser trocadas';
  end if;
  if checklist_uuid is null then
    select array_agg(value order by n) into v_nomes
    from public.producao_servicos s, jsonb_array_elements_text(s.etapas) with ordinality as e(value, n)
    where s.id = o.servico_id and jsonb_typeof(s.etapas) = 'array';
    v_nomes := coalesce(v_nomes, public.etapas_padrao_tipo(o.tipo));
  end if;
  perform public.aplicar_etapas_ordem(ordem_uuid, checklist_uuid, v_nomes);
  insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
  values (ordem_uuid, 'etapas', case when checklist_uuid is null then 'Etapas voltaram ao padrão'
    else format('Etapas do checklist "%s"', (select name from public.checklists where id = checklist_uuid)) end);
end;
$$;
revoke all on function public.trocar_checklist_ordem(uuid, uuid) from public, anon;
grant execute on function public.trocar_checklist_ordem(uuid, uuid) to authenticated;

-- ---------- 6) Ordens da liberação: etapas do checklist padrão do tipo ----------
-- Igual à 0036 (mesma assinatura e regras; a 0038 a chama para itens novos), trocando as etapas
-- fixas no código pelo checklist padrão do tipo, quando houver.
create or replace function public.gerar_ordens_liberacao(p_liberacao uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.liberacoes%rowtype;
  v_pedido public.vendas%rowtype;
  it public.vendas_itens%rowtype;
  v_tipo text;
  v_id uuid;
  v_status text;
  n integer := 0;
begin
  select * into l from public.liberacoes where id = p_liberacao;
  if not found or l.venda_id is null then return 0; end if;
  select * into v_pedido from public.vendas where id = l.venda_id;
  if not found then return 0; end if;
  v_status := case when l.status = 'aprovada' then 'Aguardando' else 'Aguardando liberação' end;

  for it in
    select vi.* from public.vendas_itens vi
    where vi.venda_id = l.venda_id
      and not exists (select 1 from public.ordens_producao o where o.venda_item_id = vi.id)
    order by vi.ordem
  loop
    v_tipo := case when it.categoria <> 'Mídia OOH' and btrim(l.endereco) <> '' then 'Instalação' else 'Impressão' end;
    insert into public.ordens_producao (
      tipo, status, venda_id, cadastro_id, descricao, data_prevista, local_instalacao,
      observacao, liberacao_id, venda_item_id, created_by
    ) values (
      v_tipo, v_status, l.venda_id, coalesce(l.cadastro_id, v_pedido.cadastro_id),
      it.descricao || coalesce(' — ' || nullif(btrim(it.ponto), ''), ''),
      l.data_entrega,
      case when v_tipo = 'Instalação' then btrim(l.endereco) end,
      concat_ws(' · ',
        'Quantidade: ' || trim_scale(it.quantidade)::text,
        case when it.periodo_inicio is not null or it.periodo_fim is not null then
          'Período: ' || coalesce(to_char(it.periodo_inicio, 'DD/MM/YYYY'), '?') || ' a '
            || coalesce(to_char(it.periodo_fim, 'DD/MM/YYYY'), '?') end),
      l.id, it.id, auth.uid()
    ) returning id into v_id;

    perform public.aplicar_etapas_ordem(
      v_id,
      (select p.checklist_id from public.ordens_checklist_padrao p
       where p.tipo = v_tipo
         and exists (select 1 from public.checklist_tasks t where t.checklist_id = p.checklist_id)),
      public.etapas_padrao_tipo(v_tipo));

    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    values (v_id, 'criacao', format('Ordem criada pela liberação nº %s (pedido %s)', l.numero, v_pedido.numero));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.gerar_ordens_liberacao(uuid) from public, anon, authenticated;

-- ---------- 7) Só a gestão reabre uma etapa concluída ----------
-- Igual à 0035, mais essa regra.
create or replace function public.atualizar_etapa_producao(etapa_uuid uuid, concluida boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ordem uuid;
  v_nome text;
  v_status text;
  v_concluido boolean;
begin
  if not public.can_executar_operacao(auth.uid()) then
    raise exception 'Só Gestão, PCP, Produção e Montagem marcam etapas' using errcode = '42501';
  end if;
  select e.ordem_id, e.nome, o.status, e.concluido into v_ordem, v_nome, v_status, v_concluido
  from public.ordens_producao_etapas e join public.ordens_producao o on o.id = e.ordem_id
  where e.id = etapa_uuid for update of e;
  if not found then raise exception 'Etapa não encontrada'; end if;
  if v_status in ('Concluída', 'Cancelada') then raise exception 'Reabra a ordem antes de alterar as etapas'; end if;
  if v_concluido and not concluida and not public.has_role(auth.uid(), 'gestor') then
    raise exception 'Só a gestão reabre uma etapa concluída' using errcode = '42501';
  end if;
  if v_concluido = concluida then return; end if;
  if concluida then
    perform public.fechar_apontamento_etapa(etapa_uuid, 'conclusao', '');
  end if;
  update public.ordens_producao_etapas set
    concluido = concluida,
    concluido_em = case when concluida then now() else null end,
    concluido_por = case when concluida then auth.uid() else null end,
    concluido_por_nome = case when concluida then public.current_display_name() else '' end
  where id = etapa_uuid;
  insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
  values (v_ordem, 'etapa', format('Etapa %s: %s', case when concluida then 'concluída' else 'reaberta' end, v_nome));
end;
$$;
revoke all on function public.atualizar_etapa_producao(uuid, boolean) from public, anon;
grant execute on function public.atualizar_etapa_producao(uuid, boolean) to authenticated;

-- ---------- 8) Salvar a ordem: checklist ----------
-- Igual à 0036, mais:
--   * `checklist_id` (opcional): ordem nova com checklist copia as tarefas dele; numa ordem que
--     já existe, trocar o checklist segue trocar_checklist_ordem (só antes de começar). Quem não
--     manda `checklist_id` (app antigo) não mexe nele.
--   * ordem com checklist ou travada não refaz as etapas quando o serviço muda.
create or replace function public.salvar_ordem_producao(dados jsonb, ordem_uuid uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_antiga public.ordens_producao%rowtype;
  v_status text := coalesce(nullif(dados->>'status', ''), 'Aguardando');
  v_servico uuid := nullif(dados->>'servico_id', '')::uuid;
  v_complexidade text := coalesce(nullif(dados->>'complexidade', ''), 'Média');
  v_venda uuid := nullif(dados->>'venda_id', '')::uuid;
  v_motivo text := coalesce(btrim(dados->>'motivo_sem_pedido'), '');
  v_manda_checklist boolean := dados ? 'checklist_id';
  v_checklist uuid := nullif(dados->>'checklist_id', '')::uuid;
  v_nomes text[] := array(select jsonb_array_elements_text(coalesce(dados->'etapas', '[]'::jsonb)));
  v_etapas_alteradas boolean := false;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP criam e editam ordens de produção' using errcode = '42501';
  end if;
  if nullif(btrim(dados->>'descricao'), '') is null then raise exception 'Informe a descrição da ordem'; end if;
  if coalesce(dados->>'tipo', '') not in ('Instalação', 'Impressão') then raise exception 'Tipo de ordem inválido'; end if;
  if v_complexidade not in ('Simples', 'Média', 'Complexa') then raise exception 'Complexidade inválida'; end if;
  if v_motivo not in ('', 'Garantia', 'Retrabalho', 'Interno', 'Urgência') then raise exception 'Motivo inválido'; end if;
  if dados->>'tipo' = 'Instalação' and nullif(btrim(dados->>'local_instalacao'), '') is null then
    raise exception 'Informe o local da instalação';
  end if;
  if v_checklist is null and cardinality(v_nomes) = 0 then
    raise exception 'A ordem precisa de pelo menos uma etapa';
  end if;

  if ordem_uuid is not null then
    select * into v_antiga from public.ordens_producao where id = ordem_uuid for update;
    if not found then raise exception 'Ordem não encontrada'; end if;
    if v_antiga.liberacao_id is not null then v_venda := v_antiga.venda_id; end if;
    if v_status = 'Aguardando liberação' and v_antiga.status <> 'Aguardando liberação' then
      raise exception 'Só as ordens de uma liberação ainda não aprovada ficam em Aguardando liberação';
    end if;
  elsif v_status = 'Aguardando liberação' then
    v_status := 'Aguardando';
  end if;

  if v_venda is not null then
    if not exists (select 1 from public.vendas where id = v_venda) then raise exception 'Pedido não encontrado'; end if;
    v_motivo := '';
  elsif v_motivo = '' then
    if ordem_uuid is null or v_antiga.venda_id is not null then
      raise exception 'Ordem sem pedido: informe o motivo (Garantia, Retrabalho, Interno ou Urgência)';
    end if;
    v_motivo := v_antiga.motivo_sem_pedido;
  end if;

  if ordem_uuid is null then
    insert into public.ordens_producao (
      tipo, status, prioridade, complexidade, venda_id, motivo_sem_pedido, cadastro_id, servico_id, descricao,
      data_prevista, local_instalacao, veiculo_id, observacao, created_by
    ) values (
      dados->>'tipo', 'Aguardando', coalesce(nullif(dados->>'prioridade', ''), 'Normal'), v_complexidade,
      v_venda, v_motivo, nullif(dados->>'cadastro_id', '')::uuid,
      v_servico, btrim(dados->>'descricao'), nullif(dados->>'data_prevista', '')::date,
      nullif(btrim(dados->>'local_instalacao'), ''), nullif(dados->>'veiculo_id', '')::uuid,
      nullif(dados->>'observacao', ''), auth.uid()
    ) returning id into v_id;
    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    values (v_id, 'criacao', case when v_venda is null then format('Ordem criada sem pedido (%s)', v_motivo) else 'Ordem criada' end);
  else
    v_id := ordem_uuid;
    v_etapas_alteradas := v_antiga.servico_id is distinct from v_servico
      and v_antiga.checklist_id is null and not v_antiga.etapas_fixas
      and not (v_manda_checklist and v_checklist is not null);
    update public.ordens_producao set
      tipo = dados->>'tipo',
      status = v_status,
      prioridade = coalesce(nullif(dados->>'prioridade', ''), 'Normal'),
      complexidade = v_complexidade,
      venda_id = v_venda,
      motivo_sem_pedido = v_motivo,
      cadastro_id = nullif(dados->>'cadastro_id', '')::uuid,
      servico_id = v_servico,
      descricao = btrim(dados->>'descricao'),
      data_prevista = nullif(dados->>'data_prevista', '')::date,
      data_inicio = case when v_status = 'Em andamento' and data_inicio is null then now() else data_inicio end,
      data_conclusao = case when v_status = 'Concluída' then coalesce(data_conclusao, now()) else null end,
      local_instalacao = nullif(btrim(dados->>'local_instalacao'), ''),
      veiculo_id = nullif(dados->>'veiculo_id', '')::uuid,
      observacao = nullif(dados->>'observacao', '')
    where id = v_id;
    if v_antiga.status is distinct from v_status then
      insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
      values (v_id, 'status', format('Situação alterada de %s para %s', v_antiga.status, v_status));
    end if;
    if v_antiga.complexidade is distinct from v_complexidade then
      insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
      values (v_id, 'complexidade', format('Complexidade alterada de %s para %s', v_antiga.complexidade, v_complexidade));
    end if;
    if v_antiga.venda_id is distinct from v_venda then
      insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
      values (v_id, 'pedido', case when v_venda is null then format('Pedido desligado (%s)', v_motivo)
        else format('Ligada ao pedido %s', (select numero from public.vendas where id = v_venda)) end);
    end if;
  end if;

  delete from public.ordens_producao_equipe where ordem_id = v_id;
  insert into public.ordens_producao_equipe (ordem_id, colaborador_id)
  select distinct v_id, value::uuid from jsonb_array_elements_text(coalesce(dados->'equipe', '[]'::jsonb));

  if v_etapas_alteradas or v_status = 'Cancelada' then
    update public.ordens_producao_apontamentos set
      fim = greatest(now(), inicio), fim_tipo = 'pausa',
      motivo_pausa = case when v_status = 'Cancelada' then 'Ordem cancelada' else 'Etapas da ordem trocadas' end,
      encerrado_por = auth.uid(), encerrado_por_nome = public.current_display_name()
    where ordem_id = v_id and fim is null;
  end if;

  if ordem_uuid is null then
    perform public.aplicar_etapas_ordem(v_id, v_checklist, v_nomes);
  elsif v_manda_checklist and v_checklist is distinct from v_antiga.checklist_id then
    perform public.trocar_checklist_ordem(v_id, v_checklist);
  elsif v_etapas_alteradas then
    perform public.aplicar_etapas_ordem(v_id, null, v_nomes);
  end if;

  if v_status = 'Concluída' and exists (
    select 1 from public.ordens_producao_etapas where ordem_id = v_id and not concluido
  ) then
    raise exception 'Conclua todas as etapas antes de concluir a ordem';
  end if;
  return v_id;
end;
$$;
revoke all on function public.salvar_ordem_producao(jsonb, uuid) from public, anon;
grant execute on function public.salvar_ordem_producao(jsonb, uuid) to authenticated;
