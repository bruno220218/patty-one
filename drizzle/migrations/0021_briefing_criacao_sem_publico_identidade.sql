-- "Público e local de uso" e "Identidade visual" saíram do formulário de briefing
-- (Criação e Projetos Especiais). Limpa o que já estava salvo nesses dois campos.
--
-- Os gatilhos do usuário são desligados só dentro desta transação: o guard_briefings
-- recusa edição de conteúdo sem um usuário comercial/gestão logado (no SQL Editor não há),
-- e os demais gatilhos mandariam avisos e alterariam a data de atualização por uma limpeza.

begin;

alter table public.briefings disable trigger user;

update public.briefings
   set publico = '',
       identidade = ''
 where publico <> '' or identidade <> '';

alter table public.briefings enable trigger user;

commit;
