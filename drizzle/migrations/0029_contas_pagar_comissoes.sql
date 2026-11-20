-- Financeiro, parte 2: contas a pagar (fornecedores, aluguel dos pontos, energia, comissões,
-- impostos e outros) e comissões geradas quando o cliente paga.
-- Comissão: quando uma conta a receber ligada a um pedido vira "Recebido", nascem contas a pagar
-- da categoria Comissão sobre o valor recebido:
--   * do vendedor do pedido, com o percentual dele em comissao_vendedores;
--   * da agência/representante, quando o cadastro do cliente tem esse tipo de comissão (percentual
--     do cadastro).
-- Se o recebimento for desfeito (Aberto/Cancelado), as comissões ainda não pagas saem.
-- Mesmo acesso da 0026: Gestão, Direção e Financeiro; só Gestão e Direção excluem.

-- ---------- 1) Percentual de comissão de cada vendedor ----------
create table if not exists public.comissao_vendedores (
  vendedor text primary key check (length(btrim(vendedor)) > 0),
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  updated_at timestamptz not null default now()
);

-- ---------- 2) Contas a pagar ----------
create table if not exists public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in
    ('Fornecedor', 'Aluguel', 'Energia', 'Comissão', 'Imposto', 'Outros')),
  descricao text not null check (length(btrim(descricao)) > 0),
  vencimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'Aberto' check (status in ('Aberto', 'Pago', 'Cancelado')),
  pago_em date,
  -- A quem se paga: um cadastro (fornecedor, agência) ou só um nome (vendedor).
  cadastro_id uuid references public.cadastros (id) on delete set null,
  favorecido text,
  empresa_id uuid references public.empresas (id) on delete set null,
  contrato_aluguel_id uuid references public.contratos_aluguel (id) on delete set null,
  contrato_energia_id uuid references public.contratos_energia (id) on delete set null,
  -- Comissão: de qual recebimento veio e como foi calculada.
  conta_receber_id uuid references public.contas_receber (id) on delete set null,
  venda_id uuid references public.vendas (id) on delete set null,
  comissao_tipo text check (comissao_tipo in ('Vendedor', 'Agência')),
  comissao_base numeric(14,2),
  comissao_percentual numeric(5,2),
  observacao text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'Pago') = (pago_em is not null)),
  check ((categoria = 'Comissão') = (comissao_tipo is not null))
);
create index if not exists contas_pagar_vencimento_idx on public.contas_pagar (vencimento);
create index if not exists contas_pagar_status_idx on public.contas_pagar (status);
create index if not exists contas_pagar_categoria_idx on public.contas_pagar (categoria);
create index if not exists contas_pagar_receber_idx on public.contas_pagar (conta_receber_id);
-- Uma parcela por contrato e vencimento; uma comissão de cada tipo por recebimento.
create unique index if not exists contas_pagar_aluguel_parcela_uniq
  on public.contas_pagar (contrato_aluguel_id, vencimento) where contrato_aluguel_id is not null;
create unique index if not exists contas_pagar_comissao_uniq
  on public.contas_pagar (conta_receber_id, comissao_tipo) where conta_receber_id is not null;

create or replace function public.normalizar_conta_pagar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.descricao := btrim(new.descricao);
  new.favorecido := nullif(btrim(new.favorecido), '');
  if new.status = 'Pago' then
    new.pago_em := coalesce(new.pago_em, (now() at time zone 'America/Sao_Paulo')::date);
  else
    new.pago_em := null;
  end if;
  return new;
end;
$$;
drop trigger if exists contas_pagar_normalizar on public.contas_pagar;
create trigger contas_pagar_normalizar before insert or update on public.contas_pagar
  for each row execute function public.normalizar_conta_pagar();

-- ---------- 3) Acesso ----------
do $$
declare t text;
begin
  foreach t in array array['contas_pagar', 'comissao_vendedores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
      using (public.can_financeiro(auth.uid()))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (public.can_financeiro(auth.uid()))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
      using (public.can_financeiro(auth.uid())) with check (public.can_financeiro(auth.uid()))', t);
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before update on public.%1$I
      for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;
-- Percentual de vendedor: o Financeiro também apaga (é só configuração).
create policy contas_pagar_delete on public.contas_pagar for delete to authenticated
  using (public.can_excluir_financeiro(auth.uid()));
create policy comissao_vendedores_delete on public.comissao_vendedores for delete to authenticated
  using (public.can_financeiro(auth.uid()));

-- ---------- 4) Comissão quando o cliente paga ----------
create or replace function public.gerar_comissoes_recebimento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
  pct numeric;
  antes text := null;
begin
  -- OLD só existe no UPDATE.
  if tg_op = 'UPDATE' then antes := old.status; end if;
  if new.status = 'Recebido' and antes is distinct from 'Recebido' then
    if new.venda_id is null then return new; end if;
    select ve.id, ve.numero, ve.vendedor, ve.empresa_id, ve.cadastro_id,
           c.nome as cliente, c.tipo_comissao, c.percentual_comissao
      into v
      from public.vendas ve left join public.cadastros c on c.id = ve.cadastro_id
     where ve.id = new.venda_id;
    if not found then return new; end if;

    select cv.percentual into pct from public.comissao_vendedores cv
     where lower(cv.vendedor) = lower(btrim(v.vendedor));
    if coalesce(pct, 0) > 0 and round(new.valor * pct / 100, 2) > 0 then
      insert into public.contas_pagar (categoria, descricao, vencimento, valor, favorecido,
        empresa_id, conta_receber_id, venda_id, comissao_tipo, comissao_base, comissao_percentual,
        created_by)
      values ('Comissão', format('Comissão de %s — pedido %s (%s)', btrim(v.vendedor), v.numero,
          coalesce(v.cliente, 'sem cliente')),
        new.recebido_em, round(new.valor * pct / 100, 2), btrim(v.vendedor), v.empresa_id, new.id,
        v.id, 'Vendedor', new.valor, pct, auth.uid())
      on conflict do nothing;
    end if;

    if v.tipo_comissao in ('Comissão como Agência', 'Comissão como Representante')
       and coalesce(v.percentual_comissao, 0) > 0
       and round(new.valor * v.percentual_comissao / 100, 2) > 0 then
      insert into public.contas_pagar (categoria, descricao, vencimento, valor, cadastro_id,
        empresa_id, conta_receber_id, venda_id, comissao_tipo, comissao_base, comissao_percentual,
        created_by)
      values ('Comissão', format('Comissão de agência — pedido %s (%s)', v.numero, v.cliente),
        new.recebido_em, round(new.valor * v.percentual_comissao / 100, 2), v.cadastro_id,
        v.empresa_id, new.id, v.id, 'Agência', new.valor, v.percentual_comissao, auth.uid())
      on conflict do nothing;
    end if;
  elsif antes = 'Recebido' and new.status <> 'Recebido' then
    delete from public.contas_pagar where conta_receber_id = new.id and status <> 'Pago';
  end if;
  return new;
end;
$$;
revoke execute on function public.gerar_comissoes_recebimento() from public, anon, authenticated;
drop trigger if exists contas_receber_comissoes on public.contas_receber;
create trigger contas_receber_comissoes after insert or update of status on public.contas_receber
  for each row execute function public.gerar_comissoes_recebimento();

-- ---------- 5) Parcelas do aluguel dos pontos ----------
-- Cria as parcelas de cada contrato ativo e recorrente com valor, do próximo vencimento até a data
-- pedida (no máximo 24 por contrato), e avança o "próximo vencimento" do contrato. A vigência
-- encerra a série. Rodar de novo não duplica.
create or replace function public.gerar_parcelas_aluguel(p_ate date)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  c record;
  meses integer;
  v date;
  n integer;
  criadas integer := 0;
begin
  if not public.can_financeiro(auth.uid()) then
    raise exception 'Só Gestão, Direção e Financeiro geram parcelas' using errcode = '42501';
  end if;
  if p_ate is null or p_ate > current_date + 400 then raise exception 'Data inválida'; end if;
  for c in
    select * from public.contratos_aluguel
     where ativo and valor > 0 and vencimento is not null and vencimento <= p_ate
       and periodicidade <> 'Sem recorrência'
     for update
  loop
    meses := case c.periodicidade when 'Mensal' then 1 when 'Bimestral' then 2
      when 'Trimestral' then 3 when 'Semestral' then 6 else 12 end;
    v := c.vencimento;
    n := 0;
    while v <= p_ate and (c.vigencia is null or v <= c.vigencia) and n < 24 loop
      insert into public.contas_pagar (categoria, descricao, vencimento, valor, favorecido,
        contrato_aluguel_id)
      values ('Aluguel', format('Aluguel — %s%s', c.proprietario,
          case when c.contrato is not null then ' (contrato ' || c.contrato || ')' else '' end),
        v, c.valor, c.proprietario, c.id)
      on conflict do nothing;
      if found then criadas := criadas + 1; end if;
      n := n + 1;
      v := (c.vencimento + make_interval(months => meses * n))::date;
    end loop;
    update public.contratos_aluguel set vencimento = v where id = c.id;
  end loop;
  return criadas;
end;
$$;
revoke execute on function public.gerar_parcelas_aluguel(date) from public, anon;
grant execute on function public.gerar_parcelas_aluguel(date) to authenticated;
