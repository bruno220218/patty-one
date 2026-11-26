-- Fluxo de produção, etapa 1 (docs/fluxo-producao-plano.md): a liberação fica ligada ao pedido
-- de venda e ao cadastro do cliente.
--   * venda_id: o pedido (vendas, tipo 'pedido'). Uma liberação por pedido.
--   * cadastro_id: o cliente; quando há pedido, é sempre o cadastro do pedido.
--   * motivo_sem_pedido: obrigatório na liberação nova sem pedido (Garantia, Retrabalho,
--     Interno ou Urgência). Na Urgência, o pedido pode ser ligado depois.
-- As liberações que já existem continuam iguais (sem pedido e sem motivo) e podem ser editadas
-- como antes. Os campos de texto (cliente, vendedor...) continuam sendo o que a equipe lê; o
-- formulário os preenche a partir do pedido.
-- Depende de 0006 (liberações), 0018 (cadastros) e 0020 (vendas).

alter table public.liberacoes
  add column if not exists venda_id uuid references public.vendas (id) on delete set null,
  add column if not exists cadastro_id uuid references public.cadastros (id) on delete set null,
  add column if not exists motivo_sem_pedido text not null default '';

alter table public.liberacoes drop constraint if exists liberacoes_motivo_sem_pedido_check;
alter table public.liberacoes add constraint liberacoes_motivo_sem_pedido_check
  check (motivo_sem_pedido in ('', 'Garantia', 'Retrabalho', 'Interno', 'Urgência'));

create unique index if not exists liberacoes_venda_unica
  on public.liberacoes (venda_id) where venda_id is not null;
create index if not exists liberacoes_cadastro_idx on public.liberacoes (cadastro_id);

-- Regras da ligação (não dependem da tela). Roda junto com guard_liberacoes, que continua
-- mandando no fluxo (fila, aprovação, quem edita).
create or replace function public.guard_liberacoes_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tipo text;
  v_status text;
  v_cadastro uuid;
begin
  if tg_op = 'UPDATE' then
    -- Quem não edita o conteúdo (PCP aprovando) e liberação já aprovada (fora a gestão) não
    -- mudam a ligação.
    if not public.can_edit_liberacoes(auth.uid())
       or (old.status = 'aprovada' and not public.has_any_role(auth.uid(), array['gestor'])) then
      new.venda_id := old.venda_id;
      new.cadastro_id := old.cadastro_id;
      new.motivo_sem_pedido := old.motivo_sem_pedido;
      return new;
    end if;
  end if;

  new.motivo_sem_pedido := coalesce(btrim(new.motivo_sem_pedido), '');

  if new.venda_id is not null then
    select tipo, status, cadastro_id into v_tipo, v_status, v_cadastro
      from public.vendas where id = new.venda_id;
    if v_tipo is distinct from 'pedido' then
      raise exception 'Escolha um pedido de venda para a liberação.';
    end if;
    if v_status = 'Cancelado'
       and (tg_op = 'INSERT' or new.venda_id is distinct from old.venda_id) then
      raise exception 'Pedido cancelado não pode ser liberado para a produção.';
    end if;
    new.cadastro_id := v_cadastro;
    new.motivo_sem_pedido := '';
    return new;
  end if;

  -- Sem pedido: a liberação nova precisa do motivo. As antigas (sem pedido e sem motivo)
  -- continuam editáveis enquanto ninguém mexe na ligação.
  if new.motivo_sem_pedido = ''
     and (tg_op = 'INSERT' or old.venda_id is not null or old.motivo_sem_pedido <> '') then
    raise exception 'Informe o motivo da liberação sem pedido (Garantia, Retrabalho, Interno ou Urgência).';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_liberacoes_pedido() from public, anon, authenticated;

drop trigger if exists liberacoes_guard_pedido on public.liberacoes;
create trigger liberacoes_guard_pedido
  before insert or update of venda_id, cadastro_id, motivo_sem_pedido on public.liberacoes
  for each row execute function public.guard_liberacoes_pedido();
