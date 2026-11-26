-- Dashboard (docs/dashboard-indicadores.md, decisões do Vitor em 26/11/2026).
--   * vendas.decidida_em: quando a proposta passou a Aprovada ou Recusada (para a "Conversão de
--     propostas"). Um gatilho preenche; o app nunca escreve. Voltar para Rascunho/Enviada limpa.
--     Propostas antigas: aprovadas usam a criação do pedido gerado; recusadas, o updated_at.
--   * dashboard_resumo(): todos os números do Dashboard num jsonb só. Security invoker, para a
--     RLS de cada tabela valer; a parte "financeiro" vem null sem can_financeiro.
--     "Hoje" e "mês" no fuso America/Sao_Paulo; mês = do dia 1º até hoje, comparado com o mesmo
--     trecho do mês anterior (limitado ao último dia dele).
-- Depende de 0020 (vendas), 0019 (operação), 0022/0023 (Mídia OOH), 0026/0029 (financeiro) e
-- 0036 (situação "Aguardando liberação" das ordens). Pode rodar mais de uma vez.

-- ---------- 1) Data da decisão da proposta ----------
alter table public.vendas add column if not exists decidida_em timestamptz;

create or replace function public.vendas_decisao()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo <> 'proposta' or new.status not in ('Aprovada', 'Recusada') then
    new.decidida_em := null;
  elsif tg_op = 'INSERT' or old.status is distinct from new.status then
    new.decidida_em := now();
  else
    new.decidida_em := old.decidida_em;
  end if;
  return new;
end;
$$;
drop trigger if exists vendas_decisao on public.vendas;
create trigger vendas_decisao before insert or update on public.vendas
  for each row execute function public.vendas_decisao();

-- Propostas decididas antes desta migração. Os gatilhos ficam desligados neste update: o de
-- decisão manteria a data vazia (o status não muda) e o de updated_at trocaria a data da edição.
alter table public.vendas disable trigger vendas_decisao;
alter table public.vendas disable trigger vendas_touch;
update public.vendas p
   set decidida_em = coalesce(
     (select min(d.created_at) from public.vendas d where d.proposta_id = p.id and d.tipo = 'pedido'),
     p.updated_at)
 where p.tipo = 'proposta' and p.status in ('Aprovada', 'Recusada') and p.decidida_em is null;
alter table public.vendas enable trigger vendas_touch;
alter table public.vendas enable trigger vendas_decisao;

create index if not exists vendas_decidida_idx on public.vendas (decidida_em) where decidida_em is not null;

-- ---------- 2) Resumo do Dashboard ----------
create or replace function public.dashboard_resumo()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  mes_ini date;
  ant_ini date;
  ant_fim date;
  semana_ini date;
  bs_atual public.calendario_bissemanas;
  bs_prox public.calendario_bissemanas;
  r jsonb;
begin
  if not public.is_team_member(auth.uid()) then
    raise exception 'Só a equipe aprovada vê o Dashboard' using errcode = '42501';
  end if;

  mes_ini := date_trunc('month', hoje)::date;
  ant_ini := (mes_ini - interval '1 month')::date;
  -- Mesmo dia no mês anterior, limitado ao último dia dele (31/03 → 28 ou 29/02).
  ant_fim := least(ant_ini + (hoje - mes_ini), mes_ini - 1);
  semana_ini := hoje - (extract(isodow from hoje)::int - 1);

  select * into bs_atual from public.calendario_bissemanas where hoje between inicio and fim;
  select * into bs_prox from public.calendario_bissemanas where inicio = bs_atual.fim + 1;

  with totais as (
    -- Total da venda como em totaisVenda (comercial-rules.ts).
    select v.id, v.tipo, v.numero, v.cadastro_id, v.status, v.validade, v.decidida_em,
           (v.created_at at time zone 'America/Sao_Paulo')::date as criada,
           greatest(0, coalesce(s.subtotal, 0) - least(coalesce(s.subtotal, 0), greatest(0, v.desconto))) as total
      from public.vendas v
      left join lateral (
        select round(sum(greatest(0, i.quantidade * i.valor_unitario - i.desconto)), 2) as subtotal
          from public.vendas_itens i where i.venda_id = v.id
      ) s on true
  ),
  decididas as (
    select status, (decidida_em at time zone 'America/Sao_Paulo')::date as dia
      from public.vendas where tipo = 'proposta' and decidida_em is not null
  )
  select jsonb_build_object(
    'pedidos_mes', (select jsonb_build_object(
        'valor', coalesce(sum(total) filter (where criada between mes_ini and hoje), 0),
        'quantidade', count(*) filter (where criada between mes_ini and hoje),
        'valor_anterior', coalesce(sum(total) filter (where criada between ant_ini and ant_fim), 0),
        'quantidade_anterior', count(*) filter (where criada between ant_ini and ant_fim))
      from totais where tipo = 'pedido' and status <> 'Cancelado'),
    'propostas_abertas', (select jsonb_build_object(
        'quantidade', count(*), 'valor', coalesce(sum(total), 0))
      from totais where tipo = 'proposta' and status in ('Rascunho', 'Enviada')),
    'conversao', (select jsonb_build_object(
        'aprovadas', count(*) filter (where status = 'Aprovada' and dia between mes_ini and hoje),
        'recusadas', count(*) filter (where status = 'Recusada' and dia between mes_ini and hoje),
        'aprovadas_anterior', count(*) filter (where status = 'Aprovada' and dia between ant_ini and ant_fim),
        'recusadas_anterior', count(*) filter (where status = 'Recusada' and dia between ant_ini and ant_fim))
      from decididas),
    -- With the list (the card opens it), soonest first.
    'propostas_vencendo', (select jsonb_build_object('quantidade', count(*),
        'lista', coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'numero', t.numero,
          'cliente', c.nome, 'validade', t.validade, 'valor', t.total)
          order by t.validade, t.numero), '[]'::jsonb))
      from totais t left join public.cadastros c on c.id = t.cadastro_id
      where t.tipo = 'proposta' and t.status in ('Rascunho', 'Enviada')
        and t.validade between hoje and hoje + 7)
  ) into r;

  r := jsonb_build_object(
    'hoje', hoje,
    'mes_inicio', mes_ini,
    'anterior_inicio', ant_ini,
    'anterior_fim', ant_fim,
    'comercial', r,
    'producao', jsonb_build_object(
      'ordens_atrasadas', (select count(*) from public.ordens_producao
        where status not in ('Concluída', 'Cancelada') and data_prevista < hoje),
      'ordens_andamento', (select jsonb_build_object(
          'aguardando', count(*) filter (where status = 'Aguardando'),
          'em_andamento', count(*) filter (where status = 'Em andamento'))
        from public.ordens_producao),
      'servicos_hoje', (select jsonb_build_object(
          'total', count(*), 'concluidos', count(*) filter (where status = 'Concluído'))
        from public.programacao_servicos where data = hoje),
      'nao_realizados', (select count(*) from public.programacao_servicos
        where data between semana_ini and semana_ini + 6
          and status in ('Não realizado', 'Aguardando equipe'))),
    'projetos', jsonb_build_object(
      'em_andamento', (select count(*) from public.projects p where not p.archived
        and exists (select 1 from public.project_tasks t where t.project_id = p.id and t.completed_at is null)),
      -- Atrasado = prazo passado e não concluído (sem tarefas também conta), como isOverdue.
      'atrasados', (select count(*) from public.projects p where not p.archived and p.due_date < hoje
        and (exists (select 1 from public.project_tasks t where t.project_id = p.id and t.completed_at is null)
          or not exists (select 1 from public.project_tasks t where t.project_id = p.id))),
      'bloqueios', (select count(*) from public.project_blockers b
        join public.projects p on p.id = b.project_id
        where b.resolved_at is null and not p.archived),
      'liberacoes_fila', (select jsonb_build_object('quantidade', count(*), 'mais_antiga_em', min(enviada_em))
        from public.liberacoes where status = 'aguardando')),
    'midia', jsonb_build_object(
      'atual', public.dashboard_ocupacao(bs_atual.ano, bs_atual.numero, bs_atual.inicio, bs_atual.fim),
      'proxima', public.dashboard_ocupacao(bs_prox.ano, bs_prox.numero, bs_prox.inicio, bs_prox.fim),
      'pontos_manutencao', (select count(*) from public.pontos_midia where status = 'Em manutenção')),
    'financeiro', case when public.can_financeiro(auth.uid()) then jsonb_build_object(
      'receber_vencido', (select jsonb_build_object('valor', coalesce(sum(valor), 0), 'quantidade', count(*))
        from public.contas_receber where status = 'Aberto' and vencimento < hoje),
      'receber_7_dias', (select jsonb_build_object('valor', coalesce(sum(valor), 0), 'quantidade', count(*))
        from public.contas_receber where status = 'Aberto' and vencimento between hoje and hoje + 7),
      'pagar_7_dias', (select jsonb_build_object(
          'vencido', coalesce(sum(valor) filter (where vencimento < hoje), 0),
          'proximos', coalesce(sum(valor) filter (where vencimento >= hoje), 0))
        from public.contas_pagar where status = 'Aberto' and vencimento <= hoje + 7),
      'recebido_mes', (select jsonb_build_object(
          'valor', coalesce(sum(valor) filter (where recebido_em between mes_ini and hoje), 0),
          'valor_anterior', coalesce(sum(valor) filter (where recebido_em between ant_ini and ant_fim), 0))
        from public.contas_receber where status = 'Recebido'))
    end);
  return r;
end;
$$;

-- Ocupação de uma bi-semana: a ocupação é por ponto, então as faces do ponto contam juntas.
-- Só pontos Ativos entram (em manutenção não conta como livre). Null sem bi-semana no calendário.
create or replace function public.dashboard_ocupacao(_ano integer, _numero integer, _inicio date, _fim date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select case when _ano is null then null else (
    select jsonb_build_object(
      'ano', _ano, 'numero', _numero, 'inicio', _inicio, 'fim', _fim,
      'faces', coalesce(sum(p.faces), 0),
      'ocupadas', coalesce(sum(p.faces) filter (where o.status = 'Ocupado'), 0),
      'reservadas', coalesce(sum(p.faces) filter (where o.status = 'Reservado'), 0),
      'livres', coalesce(sum(p.faces) filter (where o.id is null), 0))
    from public.pontos_midia p
    left join public.pontos_ocupacao o on o.ponto_id = p.id and o.ano = _ano and o.bissemana = _numero
    where p.status = 'Ativo')
  end
$$;

revoke all on function public.dashboard_ocupacao(integer, integer, date, date) from public, anon;
grant execute on function public.dashboard_ocupacao(integer, integer, date, date) to authenticated, service_role;
revoke all on function public.dashboard_resumo() from public, anon;
grant execute on function public.dashboard_resumo() to authenticated, service_role;
