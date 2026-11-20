-- ============ Briefing: "Iniciar" e arquivos da entrega ============
-- 1) Quando alguém da Criação/Projetos especiais clica em "Iniciar", fica registrado
--    quando começou, e o comercial que criou e a gestão recebem o aviso.
-- 2) Arquivos da entrega da Criação ficam separados dos arquivos do comercial
--    (anexos com entidade 'briefing_entrega').
-- Rode depois da 0016. Pode rodar mais de uma vez.

-- ---------- 1) Início ----------
alter table public.briefings add column if not exists iniciado_em timestamptz;

-- Já em andamento antes desta migração: usa a última atualização como início aproximado.
update public.briefings set iniciado_em = updated_at
 where status <> 'novo' and iniciado_em is null;

create or replace function public.marca_inicio_briefing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'em_andamento' and old.status = 'novo' then
    new.iniciado_em := now();
  elsif new.status = 'novo' then
    new.iniciado_em := null;
  else
    new.iniciado_em := old.iniciado_em;   -- ninguém altera a data na mão
  end if;
  return new;
end $$;
revoke execute on function public.marca_inicio_briefing() from public, anon, authenticated;
drop trigger if exists briefings_marca_inicio on public.briefings;
create trigger briefings_marca_inicio before update on public.briefings
  for each row execute function public.marca_inicio_briefing();

-- Avisos: novo -> quem atende; iniciado -> quem criou + gestão; concluído -> quem criou + gestão.
create or replace function public.notify_briefings()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _link text := '/briefings/' || new.id;
  _gestao uuid[] := array(select distinct user_id from public.user_roles where role::text = 'gestor');
begin
  if current_setting('app.restaurando', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    perform public.avisar(public.pessoas_com_funcao(array[new.destino]), 'briefing_novo', _link,
                          new.numero, new.cliente, new.titulo);
  elsif new.status is distinct from old.status and new.status in ('em_andamento', 'concluido') then
    perform public.avisar(array[new.created_by] || _gestao,
                          case new.status when 'concluido' then 'briefing_concluido' else 'briefing_andamento' end,
                          _link, new.numero, new.cliente, new.titulo);
  end if;
  return new;
end $$;
revoke execute on function public.notify_briefings() from public, anon, authenticated;

-- ---------- 2) Arquivos da entrega ----------
alter table public.anexos drop constraint if exists anexos_entidade_check;
alter table public.anexos add constraint anexos_entidade_check
  check (entidade in ('liberacao', 'briefing', 'briefing_entrega', 'visita', 'ci', 'ci_foto'));
