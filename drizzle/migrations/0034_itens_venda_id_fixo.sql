-- Fluxo de produção, etapa 3 (docs/fluxo-producao-plano.md): itens do pedido com identidade fixa.
-- Antes, salvar_venda apagava e recriava todos os itens a cada gravação, então o id do item
-- mudava. Para ligar uma ordem de produção a cada item (etapa 4), o item precisa manter o id.
-- Agora cada item enviado pode trazer "id":
--   * id de um item deste documento → o item é atualizado no lugar (mesmo id);
--   * sem id (ou id que não é deste documento, ou repetido) → item novo;
--   * itens deste documento que não vieram na lista → apagados.
-- Quem manda os itens sem id (o app antigo) continua com o resultado de antes: todos trocados.
-- Nada muda na tela. Substitui a função da 0020; o resto da 0020 continua igual.

create or replace function public.salvar_venda(dados jsonb, venda_uuid uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_tipo text;
  item jsonb;
  i integer := 0;
  v_item uuid;
  v_mantidos uuid[] := '{}';
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só comercial e gestão alteram propostas e pedidos' using errcode = '42501';
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

    -- Ids enviados que são itens deste documento (cada um conta uma vez).
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
      v_mantidos := array_remove(v_mantidos, v_item);  -- um id repetido vira item novo
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
  return v_id;
end;
$$;
revoke all on function public.salvar_venda(jsonb, uuid) from public, anon;
grant execute on function public.salvar_venda(jsonb, uuid) to authenticated;
