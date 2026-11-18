-- ============ CI de vinheta: arquivo da vinheta no Drive ============
-- O representante anexa o arquivo da vinheta na CI; o app envia direto para o Drive
-- da empresa (Patty One > CIs de vinheta > ...) e guarda só o link, como nos outros anexos.
-- Rode depois da 0013.

alter table public.anexos drop constraint if exists anexos_entidade_check;
alter table public.anexos add constraint anexos_entidade_check
  check (entidade in ('liberacao', 'briefing', 'visita', 'ci'));

-- Excluir uma CI também apaga os registros dos anexos dela (o arquivo continua no Drive).
create or replace function public.excluir_ci(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ci public.cis;
begin
  select * into v_ci from public.cis where id = _id for update;
  if v_ci.id is null then return; end if;
  if v_ci.created_by is distinct from auth.uid() and not public.has_role(auth.uid(), 'gestor') then
    raise exception 'Só quem criou a CI (ou a gestão) pode excluí-la.' using errcode = '42501';
  end if;
  if exists (select 1 from public.ci_paineis where ci_id = _id and status <> 'pendente') then
    raise exception 'A Criação já deu entrada nesta CI: ela não pode ser excluída.' using errcode = '42501';
  end if;
  delete from public.anexos where entidade = 'ci' and entidade_id = _id;
  delete from public.cis where id = _id;
end $$;
revoke execute on function public.excluir_ci(uuid) from public, anon;
grant execute on function public.excluir_ci(uuid) to authenticated;
