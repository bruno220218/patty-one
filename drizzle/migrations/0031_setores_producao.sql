-- Setores da Produção (subfunções) — lista editável + setores de cada pessoa.
--
-- A função `producao` continua sendo a permissão. O setor (Impressão, Corte, Pintura…) diz onde
-- a pessoa trabalha: uma pessoa pode estar em vários setores. Isso não dá nem tira permissão;
-- serve para a pessoa ver primeiro o que é do setor dela (Programação Produção).
--
-- A lista que antes era fixa nas colunas `setor` (os 7 setores da programação e das equipes)
-- passa a ser a tabela `producao_setores`. As colunas guardam o nome e seguem a tabela por
-- chave estrangeira com `on update cascade`: renomear um setor (ex.: "Produção" → "Impressão")
-- renomeia junto a programação e as equipes. Um setor em uso não pode ser excluído.
--
--   producao_setores  → todos aprovados leem; Gestão e PCP alteram (can_gerir_operacao)
--   usuario_setores   → todos aprovados leem; só Gestão altera (como as funções, na tela Equipe)

-- ---------- 1) Lista de setores ----------
create table if not exists public.producao_setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) > 0),
  posicao integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.producao_setores (nome, posicao) values
  ('Externa', 1), ('Projetos especiais', 2), ('Serralheria', 3), ('Acabamento e montagem', 4),
  ('Produção', 5), ('Corte', 6), ('Pintura', 7)
on conflict (nome) do nothing;

-- Qualquer outro nome já gravado nas equipes entra no fim da lista (as chaves abaixo exigem).
insert into public.producao_setores (nome, posicao)
select distinct e.setor, 100 from public.producao_equipes e
on conflict (nome) do nothing;

-- ---------- 2) Colunas `setor` passam a seguir a lista ----------
do $$
declare c record;
begin
  -- A checagem fixa dos 7 nomes na programação sai (o nome gerado pelo Postgres pode variar).
  for c in
    select conname from pg_constraint
    where conrelid = 'public.programacao_servicos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%setor%'
  loop
    execute format('alter table public.programacao_servicos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.programacao_servicos drop constraint if exists programacao_servicos_setor_fkey;
alter table public.programacao_servicos
  add constraint programacao_servicos_setor_fkey foreign key (setor)
  references public.producao_setores (nome) on update cascade on delete restrict;

alter table public.producao_equipes drop constraint if exists producao_equipes_setor_fkey;
alter table public.producao_equipes
  add constraint producao_equipes_setor_fkey foreign key (setor)
  references public.producao_setores (nome) on update cascade on delete restrict;

create index if not exists producao_equipes_setor_idx on public.producao_equipes (setor);

-- ---------- 3) Setores de cada pessoa ----------
create table if not exists public.usuario_setores (
  user_id uuid not null references auth.users (id) on delete cascade,
  setor_id uuid not null references public.producao_setores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, setor_id)
);
create index if not exists usuario_setores_setor_idx on public.usuario_setores (setor_id, user_id);

-- ---------- 4) Acesso ----------
alter table public.producao_setores enable row level security;
revoke all on public.producao_setores from public, anon, authenticated;
grant select, insert, update, delete on public.producao_setores to authenticated;
grant all on public.producao_setores to service_role;
drop policy if exists equipe_le on public.producao_setores;
create policy equipe_le on public.producao_setores for select to authenticated
  using (public.is_team_member(auth.uid()));
drop policy if exists gestao_pcp_altera on public.producao_setores;
create policy gestao_pcp_altera on public.producao_setores for all to authenticated
  using (public.can_gerir_operacao(auth.uid())) with check (public.can_gerir_operacao(auth.uid()));

alter table public.usuario_setores enable row level security;
revoke all on public.usuario_setores from public, anon, authenticated;
grant select, insert, delete on public.usuario_setores to authenticated;
grant all on public.usuario_setores to service_role;
drop policy if exists equipe_le on public.usuario_setores;
create policy equipe_le on public.usuario_setores for select to authenticated
  using (public.is_team_member(auth.uid()));
drop policy if exists gestao_altera on public.usuario_setores;
create policy gestao_altera on public.usuario_setores for all to authenticated
  using (public.has_role(auth.uid(), 'gestor')) with check (public.has_role(auth.uid(), 'gestor'));
