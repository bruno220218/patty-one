-- ============ Um gestor não tira a Gestão nem o acesso de outro gestor ============
-- O servidor já não deixa um gestor apagar a conta de outro. Mas daria para contornar:
-- tirar a função Gestão do outro (ou desligar o Acesso, que apaga todas as funções) e
-- depois apagar a conta como se fosse de um colaborador. Esta regra fecha isso no banco:
-- pelo app, a linha "gestor" de user_roles só sai pela própria pessoa.
-- As outras funções (Comercial, PCP...) de um gestor continuam podendo ser trocadas.
-- Para tirar a Gestão de alguém que não quer ou não pode fazer isso sozinho, use o SQL
-- Editor do Supabase (lá não há usuário logado, então a regra não se aplica):
--   delete from public.user_roles where user_id = '<id>' and role = 'gestor';
-- Rode depois da 0029. Pode rodar mais de uma vez.

create or replace function public.proteger_gestor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role = 'gestor' and old.user_id <> auth.uid() then
    raise exception 'Não é possível tirar a Gestão ou o acesso de outro gestor. Só a própria pessoa pode deixar a Gestão.'
      using errcode = '42501';
  end if;
  return old;
end $$;
revoke execute on function public.proteger_gestor() from public, anon, authenticated;

drop trigger if exists user_roles_proteger_gestor on public.user_roles;
create trigger user_roles_proteger_gestor before delete on public.user_roles
  for each row execute function public.proteger_gestor();
