-- ============ E-mail das liberações aprovadas ============
-- Lista de e-mails (gestão edita) que recebem o PDF de toda liberação aprovada,
-- e registro "E-mail enviado" no histórico da liberação.

create table if not exists public.email_destinatarios (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nome text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists email_destinatarios_email_idx on public.email_destinatarios (lower(email));

alter table public.email_destinatarios enable row level security;
revoke all on public.email_destinatarios from public, anon, authenticated;
grant select, insert, update, delete on public.email_destinatarios to authenticated;
grant all on public.email_destinatarios to service_role;

drop policy if exists "Gestão e aprovadores leem os e-mails" on public.email_destinatarios;
create policy "Gestão e aprovadores leem os e-mails" on public.email_destinatarios
  for select to authenticated using (public.can_aprovar_liberacoes(auth.uid()));
drop policy if exists "Gestão edita os e-mails" on public.email_destinatarios;
create policy "Gestão edita os e-mails" on public.email_destinatarios
  for all to authenticated
  using (public.has_role(auth.uid(), 'gestor'))
  with check (public.has_role(auth.uid(), 'gestor'));

-- Histórico: novo tipo de evento.
alter table public.liberacao_eventos drop constraint if exists liberacao_eventos_tipo_check;
alter table public.liberacao_eventos add constraint liberacao_eventos_tipo_check
  check (tipo in ('criada', 'reprovada', 'reenviada', 'aprovada', 'email_enviado'));

create or replace function public.notify_liberacao_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _lib   public.liberacoes;
  _tipo  text;
  _actor uuid := new.autor;
begin
  -- Registro de e-mail enviado não gera aviso no sino.
  if new.tipo not in ('criada', 'reenviada', 'reprovada', 'aprovada') then return new; end if;

  select * into _lib from public.liberacoes where id = new.liberacao_id;
  if not found then return new; end if;

  _tipo := case new.tipo
    when 'criada' then 'liberacao_nova'
    when 'reenviada' then 'liberacao_reenviada'
    when 'reprovada' then 'liberacao_reprovada'
    when 'aprovada' then 'liberacao_aprovada'
  end;

  if new.tipo in ('criada', 'reenviada') then
    insert into public.notifications
      (recipient_id, tipo, liberacao_id, liberacao_numero, actor_name, project_name, detalhe)
    select distinct r.user_id, _tipo, _lib.id, _lib.numero, new.autor_nome, _lib.cliente, ''
      from public.user_roles r
     where r.user_id is distinct from _actor
       and (
         r.role::text in ('pcp', 'direcao')
         or (r.role::text = 'gestor'
             and not exists (select 1 from public.user_roles x where x.role::text in ('pcp', 'direcao')))
       );
  else
    insert into public.notifications
      (recipient_id, tipo, liberacao_id, liberacao_numero, actor_name, project_name, project_id, detalhe)
    select distinct u.user_id, _tipo, _lib.id, _lib.numero, new.autor_nome, _lib.cliente,
           _lib.project_id, new.detalhe
      from (
        select _lib.created_by as user_id where _lib.created_by is not null
        union
        select r.user_id from public.user_roles r
         where _lib.created_by is null and r.role::text = 'comercial'
      ) u
     where u.user_id is distinct from _actor;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_liberacao_evento() from public, anon, authenticated;

-- Registra no histórico que o e-mail da liberação aprovada foi enviado.
create or replace function public.registrar_email_liberacao(_liberacao_id uuid, _detalhe text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_aprovar_liberacoes(auth.uid()) then
    raise exception 'Somente PCP, direção ou gestão enviam liberações por e-mail.';
  end if;
  if not exists (select 1 from public.liberacoes where id = _liberacao_id and status = 'aprovada') then
    raise exception 'Só liberações aprovadas são enviadas por e-mail.';
  end if;
  insert into public.liberacao_eventos (liberacao_id, tipo, detalhe, autor_nome)
  values (_liberacao_id, 'email_enviado', left(coalesce(_detalhe, ''), 2000), public.current_display_name());
end $$;
revoke execute on function public.registrar_email_liberacao(uuid, text) from public, anon;
grant execute on function public.registrar_email_liberacao(uuid, text) to authenticated;
