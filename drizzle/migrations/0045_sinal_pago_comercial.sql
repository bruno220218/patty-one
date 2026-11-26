-- Sinal pago dos pedidos para o Comercial (skill Comercial, requisito de liberação).
-- As contas a receber só são lidas por Financeiro, Gestão e Direção (can_financeiro, 0026). O
-- comercial precisa saber só se o sinal do pedido já foi recebido, sem ver valores nem
-- vencimentos: esta função devolve, por pedido, quantas contas há (sem as canceladas) e quantas já
-- foram recebidas. Quem chama: comercial, gestão (can_vender) ou quem já lê o financeiro.

create or replace function public.sinal_pago_pedidos(p_vendas uuid[])
returns table (venda_id uuid, contas integer, recebidas integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.can_vender(auth.uid()) or public.can_financeiro(auth.uid())) then
    raise exception 'Só comercial, gestão e financeiro consultam o sinal dos pedidos' using errcode = '42501';
  end if;
  return query
    select c.venda_id, count(*)::integer, count(*) filter (where c.status = 'Recebido')::integer
    from public.contas_receber c
    where c.venda_id = any(coalesce(p_vendas, '{}'::uuid[])) and c.status <> 'Cancelado'
    group by c.venda_id;
end;
$$;
revoke all on function public.sinal_pago_pedidos(uuid[]) from public, anon;
grant execute on function public.sinal_pago_pedidos(uuid[]) to authenticated;
