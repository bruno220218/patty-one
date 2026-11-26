-- Fluxo de produção, etapa 4 (docs/fluxo-producao-plano.md): ordens automáticas e ordem sem pedido.
--   * Liberação ligada a um pedido → nasce uma ordem de produção por item do pedido, na situação
--     nova "Aguardando liberação" (ligada por liberacao_id e venda_item_id; uma ordem por item).
--     Quem cria a liberação é o comercial, que não edita ordens: a criação é feita por uma função
--     security definer chamada pelo gatilho da liberação.
--   * Aprovada a liberação, essas ordens passam para "Aguardando" (entram na produção). Enquanto
--     não aprovada, ninguém inicia nem dá baixa nas etapas; reprovada, elas continuam esperando.
--   * Trocar o pedido da liberação (antes da aprovação) refaz as ordens que ainda esperam;
--     excluir a liberação apaga as ordens que ainda esperavam (as outras ficam, sem a ligação).
--   * Ordem aberta à mão sem pedido: motivo obrigatório (Garantia, Retrabalho, Interno,
--     Urgência), como na liberação. Na Urgência o pedido pode ser ligado depois. As ordens que já
--     existem (sem pedido e sem motivo) continuam editáveis.
--   * A aprovação deixa de criar Projeto para liberação ligada a pedido (isso é na tela); as
--     liberações antigas não mudam.
-- Depende de 0019 (ordens), 0032 (liberação ↔ pedido), 0034 (itens com id fixo) e 0035 (tempo).

-- ---------- 1) Colunas e situação nova ----------
alter table public.ordens_producao
  add column if not exists liberacao_id uuid references public.liberacoes (id) on delete set null,
  add column if not exists venda_item_id uuid references public.vendas_itens (id) on delete set null,
  add column if not exists motivo_sem_pedido text not null default '';

alter table public.ordens_producao drop constraint if exists ordens_producao_motivo_sem_pedido_check;
alter table public.ordens_producao add constraint ordens_producao_motivo_sem_pedido_check
  check (motivo_sem_pedido in ('', 'Garantia', 'Retrabalho', 'Interno', 'Urgência'));

alter table public.ordens_producao drop constraint if exists ordens_producao_status_check;
alter table public.ordens_producao add constraint ordens_producao_status_check
  check (status in ('Aguardando liberação', 'Aguardando', 'Em andamento', 'Concluída', 'Cancelada'));

create index if not exists ordens_producao_liberacao_idx on public.ordens_producao (liberacao_id);
create unique index if not exists ordens_producao_item_unico
  on public.ordens_producao (venda_item_id) where venda_item_id is not null;

-- ---------- 2) Gerar as ordens de uma liberação ----------
-- Uma ordem por item do pedido que ainda não tem ordem. Tipo: Instalação quando a liberação tem
-- endereço e o item não é Mídia OOH; senão Impressão (o PCP ajusta). Etapas: as padrão do tipo
-- (as mesmas de ETAPAS_PADRAO em producao-rules.ts). Uso interno (gatilho).
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

    insert into public.ordens_producao_etapas (ordem_id, ordem, nome)
    select v_id, n2::integer, nome
    from unnest(case when v_tipo = 'Instalação'
                     then array['Preparação', 'Logística', 'Instalação', 'Conferência']
                     else array['Arte e preparação', 'Impressão', 'Acabamento', 'Conferência'] end)
         with ordinality as e(nome, n2);

    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    values (v_id, 'criacao', format('Ordem criada pela liberação nº %s (pedido %s)', l.numero, v_pedido.numero));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.gerar_ordens_liberacao(uuid) from public, anon, authenticated;

-- ---------- 3) Gatilhos da liberação ----------
create or replace function public.ordens_da_liberacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform public.gerar_ordens_liberacao(new.id);
    return null;
  end if;

  if new.venda_id is distinct from old.venda_id then
    -- Só as que ainda esperam saem; as que já andaram ficam (sem mudar de pedido).
    delete from public.ordens_producao where liberacao_id = new.id and status = 'Aguardando liberação';
    perform public.gerar_ordens_liberacao(new.id);
  end if;

  if new.status = 'aprovada' and old.status is distinct from 'aprovada' then
    insert into public.ordens_producao_eventos (ordem_id, tipo, descricao)
    select id, 'status', format('Liberação nº %s aprovada: situação alterada de Aguardando liberação para Aguardando', new.numero)
    from public.ordens_producao where liberacao_id = new.id and status = 'Aguardando liberação';
    update public.ordens_producao set status = 'Aguardando'
    where liberacao_id = new.id and status = 'Aguardando liberação';
  end if;
  return null;
end;
$$;
revoke all on function public.ordens_da_liberacao() from public, anon, authenticated;

drop trigger if exists liberacoes_ordens on public.liberacoes;
create trigger liberacoes_ordens after insert or update of venda_id, status on public.liberacoes
  for each row execute function public.ordens_da_liberacao();

create or replace function public.ordens_da_liberacao_excluida()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.ordens_producao where liberacao_id = old.id and status = 'Aguardando liberação';
  return old;
end;
$$;
revoke all on function public.ordens_da_liberacao_excluida() from public, anon, authenticated;

drop trigger if exists liberacoes_ordens_exclui on public.liberacoes;
create trigger liberacoes_ordens_exclui before delete on public.liberacoes
  for each row execute function public.ordens_da_liberacao_excluida();

-- ---------- 4) Sem liberação aprovada, a ordem não é executada ----------
create or replace function public.guard_ordem_liberada()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.ordens_producao where id = new.ordem_id and status = 'Aguardando liberação') then
    raise exception 'A liberação desta ordem ainda não foi aprovada';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_ordem_liberada() from public, anon, authenticated;

drop trigger if exists apontamentos_ordem_liberada on public.ordens_producao_apontamentos;
create trigger apontamentos_ordem_liberada before insert on public.ordens_producao_apontamentos
  for each row execute function public.guard_ordem_liberada();
drop trigger if exists etapas_ordem_liberada on public.ordens_producao_etapas;
create trigger etapas_ordem_liberada before update of concluido on public.ordens_producao_etapas
  for each row when (new.concluido is distinct from old.concluido)
  execute function public.guard_ordem_liberada();

-- ---------- 5) Salvar a ordem: motivo sem pedido e ligação com a liberação ----------
-- Igual à 0035, mais:
--   * ordem nova sem pedido exige o motivo; com pedido, o motivo é limpo; tirar o pedido de uma
--     ordem exige o motivo; ordens antigas sem pedido e sem motivo seguem editáveis;
--   * ordem da liberação: o pedido não muda por aqui, e liberacao_id/venda_item_id nunca mudam;
--   * "Aguardando liberação" não é escolhida à mão: só a ordem que já está nela continua nela.
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
  if jsonb_array_length(coalesce(dados->'etapas', '[]'::jsonb)) = 0 then
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
    v_etapas_alteradas := v_antiga.servico_id is distinct from v_servico;
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

  if ordem_uuid is null or v_etapas_alteradas then
    delete from public.ordens_producao_etapas where ordem_id = v_id;
    insert into public.ordens_producao_etapas (ordem_id, ordem, nome)
    select v_id, n::integer, value from jsonb_array_elements_text(dados->'etapas') with ordinality as e(value, n);
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

-- ---------- 6) Liberações já ligadas a pedido e ainda não aprovadas ----------
-- (as aprovadas seguem o caminho antigo, com Projeto)
select public.gerar_ordens_liberacao(id)
from public.liberacoes
where venda_id is not null and status <> 'aprovada';
