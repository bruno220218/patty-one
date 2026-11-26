-- Fluxo de produção, etapa 11 (docs/fluxo-producao-plano.md): Mídia OOH vira ordem de colagem.
--   * Tipo de ordem novo: Colagem. A ordem guarda o ponto de mídia (ponto_id) e a bi-semana
--     (bissemana_ano + bissemana_numero, do calendário da 0022).
--   * O item Mídia OOH do pedido gera uma ordem de Colagem (antes: Impressão), com:
--       - a bi-semana em que cai o início do período do item;
--       - data prevista = início do período (sem período, a data de entrega da liberação);
--       - o ponto, quando o texto do item é exatamente o código ou o nome de um ponto cadastrado
--         (um só); o endereço do ponto (ou o texto do item) vai para o local.
--     O PCP escolhe ou corrige o ponto e a bi-semana na ordem.
--   * Etapas padrão da Colagem e checklist padrão próprio (Checklists › padrão por tipo).
--   * Como as outras ordens, a de Colagem entra na Programação (Pendências › ordens a programar);
--     o serviço já vem com o ponto.
-- As ordens de mídia já criadas como Impressão continuam como estão (o PCP pode trocar o tipo).
-- Redefine, a partir da 0039: etapas_padrao_tipo, definir_checklist_padrao,
-- gerar_ordens_liberacao (mesma assinatura e regras) e salvar_ordem_producao (quem não manda
-- ponto/bi-semana não mexe neles). Depende de 0022, 0036, 0039 e 0040.

-- ---------- 1) Tipo, ponto e bi-semana ----------
alter table public.ordens_producao drop constraint if exists ordens_producao_tipo_check;
alter table public.ordens_producao add constraint ordens_producao_tipo_check
  check (tipo in ('Instalação', 'Impressão', 'Colagem'));

alter table public.ordens_producao
  add column if not exists ponto_id uuid references public.pontos_midia (id) on delete set null,
  add column if not exists bissemana_ano integer,
  add column if not exists bissemana_numero integer;
alter table public.ordens_producao drop constraint if exists ordens_producao_bissemana_fk;
alter table public.ordens_producao add constraint ordens_producao_bissemana_fk
  foreign key (bissemana_ano, bissemana_numero) references public.calendario_bissemanas (ano, numero);
alter table public.ordens_producao drop constraint if exists ordens_producao_bissemana_completa;
alter table public.ordens_producao add constraint ordens_producao_bissemana_completa
  check ((bissemana_ano is null) = (bissemana_numero is null));
create index if not exists ordens_producao_ponto_idx on public.ordens_producao (ponto_id);

-- ---------- 2) Checklist padrão e etapas padrão da Colagem ----------
alter table public.ordens_checklist_padrao drop constraint if exists ordens_checklist_padrao_tipo_check;
alter table public.ordens_checklist_padrao add constraint ordens_checklist_padrao_tipo_check
  check (tipo in ('Instalação', 'Impressão', 'Colagem'));

create or replace function public.definir_checklist_padrao(p_tipo text, p_checklist uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_gerir_checklists(auth.uid()) then
    raise exception 'Só Gestão e PCP escolhem o checklist padrão das ordens' using errcode = '42501';
  end if;
  if coalesce(p_tipo, '') not in ('Instalação', 'Impressão', 'Colagem') then raise exception 'Tipo de ordem inválido'; end if;
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

-- As mesmas de ETAPAS_PADRAO em producao-rules.ts.
create or replace function public.etapas_padrao_tipo(p_tipo text)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select case p_tipo
    when 'Instalação' then array['Preparação', 'Logística', 'Instalação', 'Conferência']
    when 'Colagem' then array['Impressão', 'Separação do material', 'Colagem', 'Foto de comprovação']
    else array['Arte e preparação', 'Impressão', 'Acabamento', 'Conferência'] end
$$;

-- ---------- 3) Ponto pelo texto do item (uso interno) ----------
-- O ponto cujo código ou nome é exatamente o texto (sem diferenciar maiúsculas); null se não
-- houver um só.
create or replace function public.ponto_do_texto(p_texto text)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 1 then (array_agg(id))[1] end
  from public.pontos_midia
  where nullif(btrim(p_texto), '') is not null
    and (lower(btrim(codigo)) = lower(btrim(p_texto)) or lower(btrim(nome)) = lower(btrim(p_texto)));
$$;
revoke all on function public.ponto_do_texto(text) from public, anon, authenticated;

-- ---------- 4) Ordens da liberação: Mídia OOH vira Colagem ----------
-- Igual à 0039 (mesma assinatura e regras; a 0038 a chama para itens novos), mais a Colagem.
create or replace function public.gerar_ordens_liberacao(p_liberacao uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.liberacoes%rowtype;
  v_pedido public.vendas%rowtype;
  it public.vendas_itens%rowtype;
  v_tipo text;
  v_id uuid;
  v_status text;
  v_ponto uuid;
  v_bs public.calendario_bissemanas%rowtype;
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
    v_tipo := case when it.categoria = 'Mídia OOH' then 'Colagem'
                   when btrim(l.endereco) <> '' then 'Instalação' else 'Impressão' end;
    v_ponto := case when v_tipo = 'Colagem' then public.ponto_do_texto(it.ponto) end;
    v_bs := null;
    if v_tipo = 'Colagem' and it.periodo_inicio is not null then
      select * into v_bs from public.calendario_bissemanas
      where it.periodo_inicio between inicio and fim;
    end if;
    insert into public.ordens_producao (
      tipo, status, venda_id, cadastro_id, descricao, data_prevista, local_instalacao,
      observacao, liberacao_id, venda_item_id, created_by, ponto_id, bissemana_ano, bissemana_numero
    ) values (
      v_tipo, v_status, l.venda_id, coalesce(l.cadastro_id, v_pedido.cadastro_id),
      it.descricao || coalesce(' — ' || nullif(btrim(it.ponto), ''), ''),
      case when v_tipo = 'Colagem' then coalesce(it.periodo_inicio, l.data_entrega) else l.data_entrega end,
      case when v_tipo = 'Instalação' then btrim(l.endereco)
           when v_tipo = 'Colagem' then coalesce(
             (select nullif(concat_ws(', ', nullif(btrim(p.endereco), ''), nullif(btrim(p.bairro), ''), nullif(btrim(p.cidade), '')), '')
              from public.pontos_midia p where p.id = v_ponto),
             nullif(btrim(it.ponto), '')) end,
      concat_ws(' · ',
        'Quantidade: ' || trim_scale(it.quantidade)::text,
        case when it.periodo_inicio is not null or it.periodo_fim is not null then
          'Período: ' || coalesce(to_char(it.periodo_inicio, 'DD/MM/YYYY'), '?') || ' a '
            || coalesce(to_char(it.periodo_fim, 'DD/MM/YYYY'), '?') end),
      l.id, it.id, auth.uid(), v_ponto, v_bs.ano, v_bs.numero
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

-- ---------- 5) Salvar a ordem: Colagem, ponto e bi-semana ----------
-- Igual à 0039, mais: tipo Colagem; ponto_id e bissemana_ano/bissemana_numero (validados);
-- quem não manda essas chaves (app antigo) não mexe nelas.
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
  v_ponto uuid := nullif(dados->>'ponto_id', '')::uuid;
  v_bs_ano integer := nullif(dados->>'bissemana_ano', '')::integer;
  v_bs_num integer := nullif(dados->>'bissemana_numero', '')::integer;
begin
  if not public.can_gerir_operacao(auth.uid()) then
    raise exception 'Só Gestão e PCP criam e editam ordens de produção' using errcode = '42501';
  end if;
  if nullif(btrim(dados->>'descricao'), '') is null then raise exception 'Informe a descrição da ordem'; end if;
  if coalesce(dados->>'tipo', '') not in ('Instalação', 'Impressão', 'Colagem') then raise exception 'Tipo de ordem inválido'; end if;
  if (v_bs_ano is null) <> (v_bs_num is null) then raise exception 'Informe o ano e o número da bi-semana'; end if;
  if v_bs_ano is not null and not exists (
    select 1 from public.calendario_bissemanas where ano = v_bs_ano and numero = v_bs_num
  ) then raise exception 'Bi-semana fora do calendário'; end if;
  if v_ponto is not null and not exists (select 1 from public.pontos_midia where id = v_ponto) then
    raise exception 'Ponto de mídia não encontrado';
  end if;
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
    if not dados ? 'ponto_id' then v_ponto := v_antiga.ponto_id; end if;
    if not dados ? 'bissemana_ano' then
      v_bs_ano := v_antiga.bissemana_ano; v_bs_num := v_antiga.bissemana_numero;
    end if;
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
      data_prevista, local_instalacao, veiculo_id, observacao, created_by,
      ponto_id, bissemana_ano, bissemana_numero
    ) values (
      dados->>'tipo', 'Aguardando', coalesce(nullif(dados->>'prioridade', ''), 'Normal'), v_complexidade,
      v_venda, v_motivo, nullif(dados->>'cadastro_id', '')::uuid,
      v_servico, btrim(dados->>'descricao'), nullif(dados->>'data_prevista', '')::date,
      nullif(btrim(dados->>'local_instalacao'), ''), nullif(dados->>'veiculo_id', '')::uuid,
      nullif(dados->>'observacao', ''), auth.uid(),
      v_ponto, v_bs_ano, v_bs_num
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
      observacao = nullif(dados->>'observacao', ''),
      ponto_id = v_ponto,
      bissemana_ano = v_bs_ano,
      bissemana_numero = v_bs_num
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
