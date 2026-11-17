-- Lista DEFINITIVA de quem recebe as liberações aprovadas.
-- Rodar só quando o teste estiver aprovado. Substitui a lista de teste.
delete from public.email_destinatarios;

insert into public.email_destinatarios (email, nome) values
  ('liberacao@pattynet.com.br',          'Liberação'),
  ('criacao@pattynet.com.br',            'Criação'),
  ('producao@pattynet.com.br',           'Produção'),
  ('projetosespeciais@pattynet.com.br',  'Projetos especiais');

select email, nome from public.email_destinatarios order by nome;
