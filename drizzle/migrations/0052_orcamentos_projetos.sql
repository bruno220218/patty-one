-- Orçamento de Projetos Especiais com a cara da planilha da Patty ("modelo orçamento", 27/11/2026).
-- Substitui, na tela, o caminho da 0050/0051 (composição dentro da proposta), que era burocrático:
--   * Documento próprio, orcamentos: "Nº 01 · NOVEMBRO" (o número recomeça todo mês), cabeçalho
--     simples em texto (cliente, informações, endereço, responsável pelo orçamento).
--   * Ao criar, já vem o escopo montado (orcamento_modelo, as linhas da planilha): Painel,
--     Estrutura, Letreiro, Pintura, Iluminação com os materiais de sempre (ligados ao produto do
--     estoque pelo nome, com o custo do estoque) e a mão de obra / deslocamento do catálogo
--     (orcamento_custos). Quem orça só preenche as quantidades; pode trocar valores e pôr linhas.
--   * Preço = custo ÷ fatores da Gestão (0,55 / 0,59 / 0,62), entrada 50% (orcamento_config).
--   * Fluxo: Projetos envia para a Gestão (revisão R1, R2…) → Gestão fecha ou devolve (motivo) →
--     o Comercial gera a proposta (com o preço escolhido e a lista de material no item, que entra
--     na previsão do estoque) → cliente pede ajuste: reabre para Projetos (nova revisão; a
--     proposta ainda não aprovada é atualizada ao gerar de novo).
-- Quem: Projetos Especiais, Gestão e Direção montam; Gestão/Direção fecham; Comercial (e Gestão)
-- geram a proposta e registram o ajuste; leem os que veem custo (estoque.pode_ver_custo).
-- Depende de 0046–0051. Pode rodar mais de uma vez.

-- ---------- 1) Modelo (as linhas da planilha) ----------
create table if not exists public.orcamento_modelo (
  id uuid primary key default gen_random_uuid(),
  secao text not null check (secao in ('Painel', 'Estrutura', 'Letreiro', 'Pintura', 'Iluminação')),
  ordem integer not null default 0,
  descricao text not null check (length(btrim(descricao)) > 0),
  unidade text not null default 'un',
  valor numeric(14,4) not null default 0 check (valor >= 0),
  -- true: o valor da linha é o do modelo (ex.: adesivo COM IMPRESSÃO, serviço); false: custo do estoque.
  preco_fixo boolean not null default false,
  -- produto do estoque cujo consumo a linha representa (null = procura pelo nome).
  produto_nome text,
  observacao text,
  ativo boolean not null default true
);
create unique index if not exists orcamento_modelo_unico on public.orcamento_modelo (secao, lower(descricao));

insert into public.orcamento_modelo (secao, ordem, descricao, unidade, valor, preco_fixo, produto_nome, observacao) values
  ('Painel', 1, 'ACM 1.22', 'chapa', 480, false, null, null),
  ('Painel', 2, 'FITA DUPLA FACE 19 MM - 20 M', 'un', 94.20, false, null, null),
  ('Painel', 3, 'PRIMER PARA FITA DUPLA FACE - 900 ML', 'un', 99.90, false, null, null),
  ('Painel', 4, 'PU', 'un', 25, false, null, null),
  ('Estrutura', 1, 'TUBO DE ALUMINIO 25X50', 'un', 100, false, null, null),
  ('Estrutura', 2, 'METALON 20x20x18 - 6 MTS', 'barra', 42, false, null, null),
  ('Estrutura', 3, 'METALON 30X20X18 - 6 MTS', 'barra', 52, false, null, null),
  ('Estrutura', 4, 'METALON 20X40X18 - 6 MTS', 'barra', 65, false, null, null),
  ('Estrutura', 5, 'TINTA CINZA SUVINIL - 3.6 L FERROLAC', 'un', 192, false, null,
    'Cálculo de tinta = (quantidade de metalon × 6) × 0,15'),
  ('Estrutura', 6, 'ELETRODO 2.5', 'un', 19.99, false, null, null),
  ('Estrutura', 7, 'BUCHA E PARAFUSO 10', 'un', 1.20, false, null, null),
  ('Letreiro', 1, 'MDF CRU 6MM - 2,75 X 1,83 M', 'chapa', 115.50, false, null, null),
  ('Letreiro', 2, 'ADESIVO BRILHO 1,06 - COM IMPRESSÃO', 'm²', 25.48, true, 'ADESIVO BRILHO 1,06',
    'Valor com tinta (R$ 1,40) + 80%'),
  ('Letreiro', 3, 'CORTE ROUTER - Chapa Galvanizada', 'm', 6, true, null, null),
  ('Letreiro', 4, 'CORTE ROUTER', 'm', 4.50, true, null, null),
  ('Letreiro', 5, 'CORTE LASER', 'm', 4, true, null, null),
  ('Letreiro', 6, 'GRAVAÇÃO LASER', 'm²', 0, true, null, null),
  ('Letreiro', 7, 'FITA DUPLA FACE 19 MM - 20 M', 'un', 94.20, false, null, null),
  ('Letreiro', 8, 'PARAFUSO AUTOBROCANTE FLANGEADO 4,2 X 13MM', 'un', 0.11, false, null, null),
  ('Letreiro', 9, 'PARAFUSO ATARRAXANTE 2.2 X 9.5MM', 'un', 0.08, false, null, null),
  ('Letreiro', 10, 'BARRA SOLDA', 'un', 26, false, null, null),
  ('Letreiro', 11, 'PAPEL 76X112 90GR', 'm²', 1.60, false, null, '1 L × 15 m²'),
  ('Letreiro', 12, 'COLA SUPERCIANO - 100 ML', 'un', 30, false, null, null),
  ('Letreiro', 13, 'ACELERADOR QFS PARA COLAS - 200 ML', 'un', 26, false, null, null),
  ('Pintura', 1, 'TINTA DUCO - 900 ML', 'un', 130, false, null, null),
  ('Pintura', 2, 'TINTA POLIESTER - 900 ML', 'un', 180, false, null, null),
  ('Pintura', 3, 'PRIMER UNIVERSAL - 900 ML', 'un', 45, false, null, null),
  ('Iluminação', 1, 'MODULO 3 DIODOS', 'un', 0.75, false, null, null),
  ('Iluminação', 2, 'LAMPADA TUBULAR LED 60 CM', 'un', 10.15, false, null, null),
  ('Iluminação', 3, 'FONTE GRANDE - 30 A', 'un', 55, false, null, null),
  ('Iluminação', 4, 'TIMER', 'un', 39.64, false, null, null),
  ('Iluminação', 5, 'SOQUETE MACHO 10a', 'un', 3, false, null, null),
  ('Iluminação', 6, 'SOQUETE FEMEA 10a', 'un', 3, false, null, null),
  ('Iluminação', 7, 'SILICONE 280 gr', 'un', 18, false, null, null),
  ('Iluminação', 8, 'CABO PARALELO 1,50', 'm', 4.15, false, null, null),
  ('Iluminação', 9, 'CABO DE SOM', 'm', 1.25, false, null, null),
  ('Iluminação', 10, 'SOQUETE PARA LAMPADA', 'un', 1.35, false, null, null),
  ('Iluminação', 11, 'ABRAÇADEIRA', 'un', 0.99, false, null, null)
on conflict do nothing;

-- ---------- 2) Orçamentos, linhas e revisões ----------
create table if not exists public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  numero integer not null,
  cliente text not null default '',
  informacoes text not null default '',
  endereco text not null default '',
  responsavel text not null default '',
  observacao text not null default '',
  situacao text not null default 'em_orcamento'
    check (situacao in ('em_orcamento', 'aguardando_aprovacao', 'devolvido', 'aprovado')),
  revisao integer not null default 0,
  briefing_id uuid references public.briefings (id) on delete set null,
  venda_id uuid references public.vendas (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_nome text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ano, mes, numero)
);
create index if not exists orcamentos_briefing_idx on public.orcamentos (briefing_id) where briefing_id is not null;

create table if not exists public.orcamentos_linhas (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  secao text not null check (secao in ('Painel', 'Estrutura', 'Letreiro', 'Pintura', 'Iluminação',
    'Outros', 'Mão de obra', 'Deslocamento')),
  ordem integer not null default 0,
  descricao text not null check (length(btrim(descricao)) > 0),
  unidade text not null default 'un',
  quantidade numeric(14,4) not null default 0 check (quantidade >= 0),
  valor_unitario numeric(14,4) not null default 0 check (valor_unitario >= 0),
  produto_id uuid references estoque.produtos (id) on delete set null,
  custo_id uuid references public.orcamento_custos (id) on delete set null,
  observacao text
);
create index if not exists orcamentos_linhas_idx on public.orcamentos_linhas (orcamento_id, secao, ordem);

create table if not exists public.orcamentos_revisoes (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  numero integer not null,
  custo numeric(14,2) not null default 0,
  venda numeric(14,2) not null default 0,
  linhas jsonb not null default '[]',
  enviada_por uuid references auth.users (id) on delete set null,
  enviada_por_nome text not null default '',
  enviada_em timestamptz not null default now(),
  decisao text check (decisao in ('aprovado', 'devolvido')),
  decidido_por_nome text,
  decidido_em timestamptz,
  motivo text,
  ajuste_motivo text,
  unique (orcamento_id, numero)
);

alter table public.orcamento_modelo enable row level security;
alter table public.orcamentos enable row level security;
alter table public.orcamentos_linhas enable row level security;
alter table public.orcamentos_revisoes enable row level security;
revoke all on public.orcamento_modelo, public.orcamentos, public.orcamentos_linhas,
  public.orcamentos_revisoes from public, anon;
grant select on public.orcamento_modelo, public.orcamentos, public.orcamentos_linhas,
  public.orcamentos_revisoes to authenticated;
grant all on public.orcamento_modelo, public.orcamentos, public.orcamentos_linhas,
  public.orcamentos_revisoes to service_role;
drop policy if exists orcamento_modelo_select on public.orcamento_modelo;
drop policy if exists orcamentos_select on public.orcamentos;
drop policy if exists orcamentos_linhas_select on public.orcamentos_linhas;
drop policy if exists orcamentos_revisoes_select on public.orcamentos_revisoes;
create policy orcamento_modelo_select on public.orcamento_modelo for select to authenticated
  using (estoque.pode_ver_custo(auth.uid()));
create policy orcamentos_select on public.orcamentos for select to authenticated
  using (estoque.pode_ver_custo(auth.uid()));
create policy orcamentos_linhas_select on public.orcamentos_linhas for select to authenticated
  using (estoque.pode_ver_custo(auth.uid()));
create policy orcamentos_revisoes_select on public.orcamentos_revisoes for select to authenticated
  using (estoque.pode_ver_custo(auth.uid()));

-- ---------- 3) Permissões ----------
create or replace function public.pode_montar_orcamento(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'direcao', 'projetos_especiais'])
$$;
revoke execute on function public.pode_montar_orcamento(uuid) from public, anon;
grant execute on function public.pode_montar_orcamento(uuid) to authenticated, service_role;

-- ---------- 4) Funções ----------
-- Custo do produto (último valor pago ou referência), sem a máscara da view.
create or replace function public.orcamento_custo_produto(_produto uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.valor_unitario from estoque.movimentos m
      where m.produto_id = _produto and m.tipo = 'Entrada' and m.valor_unitario is not null
      order by m.data desc, m.created_at desc limit 1),
    (select preco_referencia from estoque.produtos where id = _produto))
$$;
revoke execute on function public.orcamento_custo_produto(uuid) from public, anon, authenticated;

-- Novo orçamento com o escopo montado. _briefing opcional (preenche cliente e informações).
create or replace function public.criar_orcamento_pe(_briefing uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ano integer := extract(year from v_hoje);
  v_mes integer := extract(month from v_hoje);
  v_num integer;
  v_id uuid;
  b public.briefings;
begin
  if not (public.pode_montar_orcamento(auth.uid()) or public.can_vender(auth.uid())) then
    raise exception 'Somente Projetos Especiais, Comercial e Gestão criam orçamentos.' using errcode = '42501';
  end if;
  if _briefing is not null then
    select * into b from public.briefings where id = _briefing;
    if not found then raise exception 'Briefing não encontrado.' using errcode = 'P0002'; end if;
    if exists (select 1 from public.orcamentos where briefing_id = _briefing) then
      raise exception 'Este briefing já tem orçamento.' using errcode = '23505';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('orcamentos.numero.' || v_ano || '.' || v_mes));
  select coalesce(max(numero), 0) + 1 into v_num from public.orcamentos where ano = v_ano and mes = v_mes;
  insert into public.orcamentos (ano, mes, numero, cliente, informacoes, responsavel, briefing_id, created_by_nome)
  values (v_ano, v_mes, v_num, coalesce(b.cliente, ''),
    coalesce(nullif(btrim(concat_ws(' — ', nullif(b.titulo, ''), nullif(b.descricao, ''))), ''), ''),
    case when public.pode_montar_orcamento(auth.uid()) then public.current_display_name() else '' end,
    _briefing, public.current_display_name())
  returning id into v_id;

  -- Materiais e serviços do modelo; produto pelo nome (ou produto_nome), custo do estoque.
  insert into public.orcamentos_linhas (orcamento_id, secao, ordem, descricao, unidade, quantidade,
    valor_unitario, produto_id, observacao)
  select v_id, m.secao, m.ordem, m.descricao, coalesce(p.unidade, m.unidade), 0,
    case when m.preco_fixo or p.id is null then m.valor
         else coalesce(public.orcamento_custo_produto(p.id), m.valor) end,
    p.id, m.observacao
  from public.orcamento_modelo m
  left join lateral (
    select pr.id, pr.unidade from estoque.produtos pr
    where pr.ativo and estoque.chave_nome(pr.nome) = estoque.chave_nome(coalesce(m.produto_nome, m.descricao))
    order by pr.codigo limit 1
  ) p on true
  where m.ativo;

  -- Mão de obra e deslocamento do catálogo.
  insert into public.orcamentos_linhas (orcamento_id, secao, ordem, descricao, unidade, quantidade,
    valor_unitario, custo_id, observacao)
  select v_id, c.grupo, c.ordem, c.nome, c.unidade, 0, c.valor, c.id, c.dica
  from public.orcamento_custos c
  where c.ativo and c.grupo in ('Mão de obra', 'Deslocamento');
  return v_id;
end $$;

-- Salva cabeçalho + todas as linhas (troca as linhas). Travado com a Gestão ou fechado.
create or replace function public.salvar_orcamento_pe(_id uuid, _dados jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orcamentos;
begin
  if not public.pode_montar_orcamento(auth.uid()) then
    raise exception 'Somente Projetos Especiais e Gestão editam o orçamento.' using errcode = '42501';
  end if;
  select * into o from public.orcamentos where id = _id for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if o.situacao in ('aguardando_aprovacao', 'aprovado') then
    raise exception 'Orçamento % : não dá para editar. Para mudar, "Cliente pediu ajuste" ou a Gestão devolve.',
      case o.situacao when 'aprovado' then 'fechado pela Gestão' else 'com a Gestão' end using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(_dados->'linhas', '[]')) l
    where coalesce(btrim(l->>'descricao'), '') = '') then
    raise exception 'Toda linha precisa de um material ou descrição.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(_dados->'linhas', '[]')) l
    where coalesce(nullif(l->>'quantidade', '')::numeric, 0) < 0
       or coalesce(nullif(l->>'valor_unitario', '')::numeric, 0) < 0) then
    raise exception 'Quantidade e valor não podem ser negativos.' using errcode = '22023';
  end if;
  update public.orcamentos set
    cliente = btrim(coalesce(_dados->>'cliente', cliente)),
    informacoes = btrim(coalesce(_dados->>'informacoes', informacoes)),
    endereco = btrim(coalesce(_dados->>'endereco', endereco)),
    responsavel = btrim(coalesce(_dados->>'responsavel', responsavel)),
    observacao = btrim(coalesce(_dados->>'observacao', observacao)),
    updated_at = now()
  where id = _id;
  if _dados ? 'linhas' then
    delete from public.orcamentos_linhas where orcamento_id = _id;
    insert into public.orcamentos_linhas (orcamento_id, secao, ordem, descricao, unidade, quantidade,
      valor_unitario, produto_id, custo_id, observacao)
    select _id, x->>'secao', n::integer, btrim(x->>'descricao'),
      coalesce(nullif(btrim(x->>'unidade'), ''), 'un'),
      coalesce(nullif(x->>'quantidade', '')::numeric, 0),
      coalesce(nullif(x->>'valor_unitario', '')::numeric, 0),
      (select p.id from estoque.produtos p where p.id = nullif(x->>'produto_id', '')::uuid),
      (select c.id from public.orcamento_custos c where c.id = nullif(x->>'custo_id', '')::uuid),
      nullif(btrim(x->>'observacao'), '')
    from jsonb_array_elements(_dados->'linhas') with ordinality t(x, n);
  end if;
end $$;

create or replace function public.orcamento_pe_custo(_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(coalesce(sum(quantidade * valor_unitario), 0), 2)
  from public.orcamentos_linhas where orcamento_id = _id
$$;
revoke execute on function public.orcamento_pe_custo(uuid) from public, anon, authenticated;

create or replace function public.enviar_orcamento_pe(_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orcamentos; v_custo numeric; v_rev integer; v_fator numeric;
begin
  if not public.pode_montar_orcamento(auth.uid()) then
    raise exception 'Somente Projetos Especiais e Gestão enviam o orçamento.' using errcode = '42501';
  end if;
  select * into o from public.orcamentos where id = _id for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if o.situacao not in ('em_orcamento', 'devolvido') then
    raise exception 'O orçamento não está com Projetos.' using errcode = '22023';
  end if;
  if btrim(o.cliente) = '' then raise exception 'Preencha o cliente.' using errcode = '22023'; end if;
  v_custo := public.orcamento_pe_custo(_id);
  if v_custo <= 0 then raise exception 'Preencha as quantidades antes de enviar.' using errcode = '22023'; end if;
  select fator_venda into v_fator from public.orcamento_config;
  v_rev := o.revisao + 1;
  insert into public.orcamentos_revisoes (orcamento_id, numero, custo, venda, linhas, enviada_por, enviada_por_nome)
  values (_id, v_rev, v_custo, round(v_custo / coalesce(v_fator, 0.55), 2),
    coalesce((select jsonb_agg(jsonb_build_object('secao', secao, 'descricao', descricao, 'unidade', unidade,
      'quantidade', quantidade, 'valor_unitario', valor_unitario) order by secao, ordem)
      from public.orcamentos_linhas where orcamento_id = _id and quantidade > 0), '[]'),
    auth.uid(), public.current_display_name());
  update public.orcamentos set situacao = 'aguardando_aprovacao', revisao = v_rev, updated_at = now() where id = _id;
  perform public.avisar(public.orcamento_destinos(array['gestor', 'direcao']), 'orcamento_aprovacao',
    '/orcamentos/' || _id, o.numero, o.cliente, 'Orçamento ' || lpad(o.numero::text, 2, '0') || ' · R' || v_rev);
  return v_rev;
end $$;

create or replace function public.decidir_orcamento_pe(_id uuid, _fechar boolean, _motivo text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orcamentos; r public.orcamentos_revisoes;
begin
  if not public.has_any_role(auth.uid(), array['gestor', 'direcao']) then
    raise exception 'Só a Gestão fecha ou devolve o orçamento.' using errcode = '42501';
  end if;
  select * into o from public.orcamentos where id = _id for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if o.situacao <> 'aguardando_aprovacao' then
    raise exception 'O orçamento não está aguardando a Gestão.' using errcode = '22023';
  end if;
  if not _fechar and coalesce(btrim(_motivo), '') = '' then
    raise exception 'Escreva o motivo para Projetos revisar.' using errcode = '22023';
  end if;
  select * into r from public.orcamentos_revisoes where orcamento_id = _id and numero = o.revisao;
  update public.orcamentos_revisoes set decisao = case when _fechar then 'aprovado' else 'devolvido' end,
    decidido_por_nome = public.current_display_name(), decidido_em = now(), motivo = nullif(btrim(_motivo), '')
  where id = r.id;
  update public.orcamentos set situacao = case when _fechar then 'aprovado' else 'devolvido' end,
    updated_at = now() where id = _id;
  if _fechar then
    perform public.avisar(
      array(select distinct u from unnest(public.orcamento_destinos(array['comercial'])
        || coalesce((select array[b.created_by] from public.briefings b where b.id = o.briefing_id), '{}')) u
        where u is not null),
      'orcamento_aprovado', '/orcamentos/' || _id, o.numero, o.cliente, 'Pode gerar a proposta e enviar ao cliente');
  else
    perform public.avisar(
      case when r.enviada_por is not null then array[r.enviada_por]
           else public.orcamento_destinos(array['projetos_especiais']) end,
      'orcamento_devolvido', '/orcamentos/' || _id, o.numero, o.cliente, btrim(_motivo));
  end if;
end $$;

-- Cliente pediu ajuste: volta para Projetos (a próxima ida à Gestão é uma revisão nova).
create or replace function public.reabrir_orcamento_pe(_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orcamentos; r public.orcamentos_revisoes;
begin
  if not (public.can_vender(auth.uid()) or public.pode_montar_orcamento(auth.uid())) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(btrim(_motivo), '') = '' then
    raise exception 'Escreva o que o cliente quer ajustar.' using errcode = '22023';
  end if;
  select * into o from public.orcamentos where id = _id for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if o.situacao <> 'aprovado' then
    raise exception 'Só um orçamento fechado volta para ajuste.' using errcode = '22023';
  end if;
  if exists (select 1 from public.vendas v where v.id = o.venda_id
    and (v.status in ('Aprovada', 'Recusada') or exists (select 1 from public.vendas p where p.proposta_id = v.id))) then
    raise exception 'A proposta deste orçamento já foi aprovada ou recusada pelo cliente.' using errcode = '22023';
  end if;
  select * into r from public.orcamentos_revisoes where orcamento_id = _id and numero = o.revisao;
  update public.orcamentos_revisoes set ajuste_motivo = btrim(_motivo) where id = r.id;
  update public.orcamentos set situacao = 'em_orcamento', updated_at = now() where id = _id;
  perform public.avisar(
    case when r.enviada_por is not null then array[r.enviada_por]
         else public.orcamento_destinos(array['projetos_especiais']) end,
    'orcamento_ajuste', '/orcamentos/' || _id, o.numero, o.cliente, btrim(_motivo));
end $$;

-- Fechado → proposta para o Comercial (preço: venda | desconto | sem_nota). A lista de material
-- (linhas com produto e quantidade) vai para o item e entra na previsão do estoque. Gerar de novo
-- (depois de um ajuste) atualiza a proposta ainda não decidida pelo cliente.
create or replace function public.gerar_proposta_orcamento_pe(_id uuid, _cadastro uuid, _empresa uuid,
  _preco text default 'venda')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orcamentos; c public.orcamento_config; v_fator numeric; v_total numeric;
  v_venda uuid; v_item uuid; v_desc text;
begin
  if not public.can_vender(auth.uid()) then
    raise exception 'Só Comercial e Gestão geram a proposta.' using errcode = '42501';
  end if;
  select * into o from public.orcamentos where id = _id for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode = 'P0002'; end if;
  if o.situacao <> 'aprovado' then
    raise exception 'A Gestão ainda não fechou este orçamento.' using errcode = '23514';
  end if;
  select * into c from public.orcamento_config;
  v_fator := case _preco when 'desconto' then c.fator_desconto when 'sem_nota' then c.fator_sem_nota
    else c.fator_venda end;
  v_total := round(public.orcamento_pe_custo(_id) / v_fator, 2);
  v_desc := 'Projeto especial — orçamento nº ' || lpad(o.numero::text, 2, '0') || '/' || o.mes || '/' || o.ano
    || coalesce(nullif(' · ' || btrim(o.informacoes), ' · '), '');

  v_venda := o.venda_id;
  if v_venda is not null then
    if exists (select 1 from public.vendas v where v.id = v_venda
      and (v.status in ('Aprovada', 'Recusada') or exists (select 1 from public.vendas p where p.proposta_id = v.id))) then
      raise exception 'A proposta deste orçamento já foi decidida pelo cliente.' using errcode = '22023';
    end if;
    select id into v_item from public.vendas_itens where venda_id = v_venda order by ordem limit 1;
    update public.vendas_itens set valor_unitario = v_total, quantidade = 1, descricao = v_desc where id = v_item;
    update public.vendas set updated_at = now() where id = v_venda;
  else
    if not exists (select 1 from public.cadastros where id = _cadastro) then
      raise exception 'Escolha o cliente no cadastro.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.empresas where id = _empresa) then
      raise exception 'Escolha a empresa.' using errcode = '22023';
    end if;
    insert into public.vendas (tipo, empresa_id, cadastro_id, status, observacao)
    values ('proposta', _empresa, _cadastro, 'Rascunho', nullif(btrim(concat_ws(E'\n', o.informacoes, o.endereco)), ''))
    returning id into v_venda;
    insert into public.vendas_itens (venda_id, ordem, categoria, descricao, quantidade, valor_unitario)
    values (v_venda, 1, 'Produção', v_desc, 1, v_total) returning id into v_item;
    update public.orcamentos set venda_id = v_venda where id = _id;
  end if;

  delete from estoque.materiais_item where venda_item_id = v_item;
  insert into estoque.materiais_item (venda_item_id, produto_id, secao, quantidade, valor_unitario, ordem,
    atualizado_por_nome)
  select v_item, l.produto_id, l.secao, sum(l.quantidade), max(l.valor_unitario), min(l.ordem),
    public.current_display_name()
  from public.orcamentos_linhas l
  where l.orcamento_id = _id and l.produto_id is not null and l.quantidade > 0
    and l.secao in ('Painel', 'Estrutura', 'Letreiro', 'Pintura', 'Iluminação', 'Outros')
  group by l.produto_id, l.secao;
  update public.orcamentos set updated_at = now() where id = _id;
  return v_venda;
end $$;

create or replace function public.excluir_orcamento_pe(_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orcamentos;
begin
  select * into o from public.orcamentos where id = _id;
  if not found then return; end if;
  if not (public.has_role(auth.uid(), 'gestor')
          or (o.created_by = auth.uid() and o.revisao = 0 and o.venda_id is null)) then
    raise exception 'Só a Gestão exclui (ou quem criou, antes de enviar).' using errcode = '42501';
  end if;
  delete from public.orcamentos where id = _id;
end $$;

revoke execute on function public.criar_orcamento_pe(uuid) from public, anon;
revoke execute on function public.salvar_orcamento_pe(uuid, jsonb) from public, anon;
revoke execute on function public.enviar_orcamento_pe(uuid) from public, anon;
revoke execute on function public.decidir_orcamento_pe(uuid, boolean, text) from public, anon;
revoke execute on function public.reabrir_orcamento_pe(uuid, text) from public, anon;
revoke execute on function public.gerar_proposta_orcamento_pe(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.excluir_orcamento_pe(uuid) from public, anon;
grant execute on function public.criar_orcamento_pe(uuid) to authenticated, service_role;
grant execute on function public.salvar_orcamento_pe(uuid, jsonb) to authenticated, service_role;
grant execute on function public.enviar_orcamento_pe(uuid) to authenticated, service_role;
grant execute on function public.decidir_orcamento_pe(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.reabrir_orcamento_pe(uuid, text) to authenticated, service_role;
grant execute on function public.gerar_proposta_orcamento_pe(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.excluir_orcamento_pe(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
