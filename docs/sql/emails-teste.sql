-- E-mails de teste das liberações aprovadas.
-- Rodar DEPOIS do email-liberacoes.sql. Pode rodar mais de uma vez sem duplicar.
insert into public.email_destinatarios (email, nome) values
  ('equipecriacao@pattynet.com.br', 'Criação'),
  ('atendimento@pattynet.com.br',   'PCP'),
  ('qualidade@pattynet.com.br',     'Qualidade')
on conflict (lower(email)) do nothing;

select email, nome from public.email_destinatarios order by nome;
