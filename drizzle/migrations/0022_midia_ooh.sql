-- ============ Mídia OOH (vinda do PattyOne) ============
-- Pontos de mídia exterior (tipos, localização no mapa, medidas, fotos no Google Drive),
-- calendário oficial das bi-semanas do SIGE e ocupação de cada ponto por bi-semana
-- (Livre → Reservado → Ocupado). No menu: Produção › "Mapeamento das áreas" (pontos)
-- e "Datas de colagens" (bi-semanas).
--
-- Quem pode o quê:
--   - toda a equipe aprovada vê (is_team_member)
--   - Gestão, Comercial e PCP cadastram e editam pontos e fotos      → can_editar_midia
--   - Gestão e Comercial reservam e ocupam bi-semanas                → can_marcar_ocupacao
--   - só a Gestão exclui pontos e cuida dos tipos de mídia e do calendário
-- Fotos: anexos com entidade 'ponto_midia' (Drive › "Mídia OOH" › pasta do ponto);
-- nada vai para o Storage do Supabase.
-- Rode depois da 0020 (independe da 0021, do briefing). Pode rodar mais de uma vez.

-- ---------- 1) Permissões ----------
create or replace function public.can_editar_midia(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial', 'pcp'])
$$;
create or replace function public.can_marcar_ocupacao(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['gestor', 'comercial'])
$$;
revoke execute on function public.can_editar_midia(uuid) from public, anon;
revoke execute on function public.can_marcar_ocupacao(uuid) from public, anon;
grant execute on function public.can_editar_midia(uuid) to authenticated, service_role;
grant execute on function public.can_marcar_ocupacao(uuid) to authenticated, service_role;

-- ---------- 2) Tipos de mídia ----------
create table if not exists public.tipos_midia (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) > 0),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.tipos_midia (nome) values ('Outdoor'), ('Front-light'), ('Painel de LED'), ('Empena')
on conflict (nome) do nothing;

alter table public.tipos_midia enable row level security;
revoke all on public.tipos_midia from public, anon;
grant select, insert, update, delete on public.tipos_midia to authenticated;
grant all on public.tipos_midia to service_role;
drop policy if exists tipos_select on public.tipos_midia;
drop policy if exists tipos_gestao on public.tipos_midia;
create policy tipos_select on public.tipos_midia for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy tipos_gestao on public.tipos_midia for all to authenticated
  using (public.has_any_role(auth.uid(), array['gestor']))
  with check (public.has_any_role(auth.uid(), array['gestor']));

-- ---------- 3) Pontos ----------
create table if not exists public.pontos_midia (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nome text not null check (length(btrim(nome)) > 0),
  tipo_id uuid not null references public.tipos_midia (id),
  endereco text,
  bairro text,
  cidade text,
  estado char(2),
  referencia text,
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  faces integer not null default 1 check (faces >= 1),
  iluminado boolean not null default false,
  largura numeric check (largura is null or largura > 0),
  altura numeric check (altura is null or altura > 0),
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo', 'Em manutenção')),
  observacao text,
  -- Vindos do SIGE (importação futura); o formulário não altera.
  id_sige text,
  codigo_sige text,
  dados_sige jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pontos_midia_coordenadas check ((latitude is null) = (longitude is null))
);
create index if not exists pontos_midia_tipo_idx on public.pontos_midia (tipo_id);
create index if not exists pontos_midia_cidade_idx on public.pontos_midia (cidade);
create unique index if not exists pontos_midia_id_sige_unique on public.pontos_midia (id_sige) where id_sige is not null;
drop trigger if exists pontos_midia_touch on public.pontos_midia;
create trigger pontos_midia_touch before update on public.pontos_midia
  for each row execute function public.touch_updated_at();

-- Código vazio vira nulo (o índice único não pode barrar dois pontos sem código); UF maiúscula.
create or replace function public.normalizar_ponto_midia()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nome := btrim(new.nome);
  new.codigo := nullif(btrim(new.codigo), '');
  new.estado := nullif(upper(btrim(new.estado)), '');
  return new;
end;
$$;
drop trigger if exists pontos_midia_normalizar on public.pontos_midia;
create trigger pontos_midia_normalizar before insert or update on public.pontos_midia
  for each row execute function public.normalizar_ponto_midia();

alter table public.pontos_midia enable row level security;
revoke all on public.pontos_midia from public, anon;
grant select, insert, delete on public.pontos_midia to authenticated;
-- As colunas do SIGE ficam fora do update pelo app.
grant update (codigo, nome, tipo_id, endereco, bairro, cidade, estado, referencia, latitude,
  longitude, faces, iluminado, largura, altura, status, observacao) on public.pontos_midia to authenticated;
grant all on public.pontos_midia to service_role;
drop policy if exists pontos_select on public.pontos_midia;
drop policy if exists pontos_insert on public.pontos_midia;
drop policy if exists pontos_update on public.pontos_midia;
drop policy if exists pontos_delete on public.pontos_midia;
create policy pontos_select on public.pontos_midia for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy pontos_insert on public.pontos_midia for insert to authenticated
  with check (public.can_editar_midia(auth.uid()) and id_sige is null and codigo_sige is null and dados_sige is null);
create policy pontos_update on public.pontos_midia for update to authenticated
  using (public.can_editar_midia(auth.uid())) with check (public.can_editar_midia(auth.uid()));
create policy pontos_delete on public.pontos_midia for delete to authenticated
  using (public.has_any_role(auth.uid(), array['gestor']));

-- Fotos do ponto apagado saem junto (os arquivos continuam no Drive).
create or replace function public.pontos_midia_limpa_anexos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.anexos where entidade = 'ponto_midia' and entidade_id = old.id;
  return old;
end;
$$;
revoke execute on function public.pontos_midia_limpa_anexos() from public, anon, authenticated;
drop trigger if exists pontos_midia_limpa_anexos on public.pontos_midia;
create trigger pontos_midia_limpa_anexos after delete on public.pontos_midia
  for each row execute function public.pontos_midia_limpa_anexos();

-- A programação de serviços já guardava ponto_id; agora aponta para o ponto.
update public.programacao_servicos s set ponto_id = null
 where ponto_id is not null and not exists (select 1 from public.pontos_midia p where p.id = s.ponto_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programacao_servicos_ponto_fk') then
    alter table public.programacao_servicos add constraint programacao_servicos_ponto_fk
      foreign key (ponto_id) references public.pontos_midia (id) on delete set null;
  end if;
end;
$$;

-- ---------- 4) Calendário oficial das bi-semanas (SIGE) ----------
-- Ciclos contínuos de 14 dias começando na segunda-feira; a bi-semana 1 do ano é a que
-- contém o dia 1º de janeiro (por isso alguns anos têm 27). O código do SIGE é o dobro do
-- número (B2, B4 … B54). Confere com o calendário do PattyOne: 235 bi-semanas de 2019 a 2027,
-- B46/2026 = 02/11 a 15/11/2026.
create table if not exists public.calendario_bissemanas (
  ano integer not null,
  numero integer not null check (numero between 1 and 27),
  codigo_sige integer not null,
  inicio date not null unique,
  fim date not null,
  primary key (ano, numero),
  unique (ano, codigo_sige),
  check (fim = inicio + 13)
);
alter table public.calendario_bissemanas enable row level security;
revoke all on public.calendario_bissemanas from public, anon;
grant select, insert, update, delete on public.calendario_bissemanas to authenticated;
grant all on public.calendario_bissemanas to service_role;
drop policy if exists calendario_select on public.calendario_bissemanas;
drop policy if exists calendario_gestao on public.calendario_bissemanas;
create policy calendario_select on public.calendario_bissemanas for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy calendario_gestao on public.calendario_bissemanas for all to authenticated
  using (public.has_any_role(auth.uid(), array['gestor']))
  with check (public.has_any_role(auth.uid(), array['gestor']));

-- Gera (ou completa) os anos pedidos; não altera períodos que já existem.
create or replace function public.gerar_calendario_bissemanas(ano_inicial integer, ano_final integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  ancora constant date := date '2025-12-29';  -- B2/2026 (bi-semana 1 de 2026)
  a integer;
  b1 date;
  prox date;
  n integer;
  criados integer := 0;
begin
  if auth.uid() is not null and not public.has_any_role(auth.uid(), array['gestor']) then
    raise exception 'Só a gestão gera o calendário' using errcode = '42501';
  end if;
  if ano_final < ano_inicial or ano_final - ano_inicial > 30 then
    raise exception 'Intervalo de anos inválido';
  end if;
  for a in ano_inicial..ano_final loop
    b1 := ancora + (floor((make_date(a, 1, 1) - ancora) / 14.0) * 14)::integer;
    prox := ancora + (floor((make_date(a + 1, 1, 1) - ancora) / 14.0) * 14)::integer;
    for n in 1..((prox - b1) / 14) loop
      insert into public.calendario_bissemanas (ano, numero, codigo_sige, inicio, fim)
      values (a, n, n * 2, b1 + (n - 1) * 14, b1 + (n - 1) * 14 + 13)
      on conflict do nothing;
      if found then criados := criados + 1; end if;
    end loop;
  end loop;
  return criados;
end;
$$;
revoke all on function public.gerar_calendario_bissemanas(integer, integer) from public, anon;
grant execute on function public.gerar_calendario_bissemanas(integer, integer) to authenticated;

select public.gerar_calendario_bissemanas(2019, 2030);

-- ---------- 5) Ocupação por bi-semana ----------
-- Sem linha = Livre. Grava quem mudou por último (com o nome guardado).
create table if not exists public.pontos_ocupacao (
  id uuid primary key default gen_random_uuid(),
  ponto_id uuid not null references public.pontos_midia (id) on delete cascade,
  ano integer not null,
  bissemana integer not null check (bissemana between 1 and 27),
  status text not null check (status in ('Reservado', 'Ocupado')),
  cliente text,
  observacao text,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ponto_id, ano, bissemana)
);
create index if not exists pontos_ocupacao_ano_idx on public.pontos_ocupacao (ano, bissemana);
drop trigger if exists pontos_ocupacao_touch on public.pontos_ocupacao;
create trigger pontos_ocupacao_touch before update on public.pontos_ocupacao
  for each row execute function public.touch_updated_at();

alter table public.pontos_ocupacao enable row level security;
revoke all on public.pontos_ocupacao from public, anon;
grant select on public.pontos_ocupacao to authenticated;
grant all on public.pontos_ocupacao to service_role;
drop policy if exists ocupacao_select on public.pontos_ocupacao;
drop policy if exists ocupacao_insert on public.pontos_ocupacao;
drop policy if exists ocupacao_update on public.pontos_ocupacao;
drop policy if exists ocupacao_delete on public.pontos_ocupacao;
create policy ocupacao_select on public.pontos_ocupacao for select to authenticated
  using (public.is_team_member(auth.uid()));

-- Única forma de mudar a ocupação: confere a função, a bi-semana no calendário e o ponto.
create or replace function public.marcar_ocupacao(p_ponto uuid, p_ano integer, p_bissemana integer,
  p_status text, p_cliente text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
begin
  if not public.can_marcar_ocupacao(auth.uid()) then
    raise exception 'Só Comercial e Gestão reservam ou ocupam bi-semanas' using errcode = '42501';
  end if;
  if p_status not in ('Livre', 'Reservado', 'Ocupado') then
    raise exception 'Situação inválida';
  end if;
  if not exists (select 1 from public.calendario_bissemanas where ano = p_ano and numero = p_bissemana) then
    raise exception 'Bi-semana fora do calendário';
  end if;
  if not exists (select 1 from public.pontos_midia where id = p_ponto) then
    raise exception 'Ponto não encontrado';
  end if;
  if p_status = 'Livre' then
    delete from public.pontos_ocupacao where ponto_id = p_ponto and ano = p_ano and bissemana = p_bissemana;
    return 'Livre';
  end if;
  select display_name into v_nome from public.profiles where id = auth.uid();
  insert into public.pontos_ocupacao (ponto_id, ano, bissemana, status, cliente, updated_by, updated_by_nome)
  values (p_ponto, p_ano, p_bissemana, p_status, nullif(btrim(p_cliente), ''), auth.uid(), v_nome)
  on conflict (ponto_id, ano, bissemana) do update set
    status = excluded.status,
    cliente = coalesce(excluded.cliente, public.pontos_ocupacao.cliente),
    updated_by = excluded.updated_by,
    updated_by_nome = excluded.updated_by_nome;
  return p_status;
end;
$$;
revoke all on function public.marcar_ocupacao(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.marcar_ocupacao(uuid, integer, integer, text, text) to authenticated;

-- ---------- 6) Fotos no Drive: anexos com entidade 'ponto_midia' ----------
alter table public.anexos drop constraint if exists anexos_entidade_check;
alter table public.anexos add constraint anexos_entidade_check
  check (entidade in ('liberacao', 'briefing', 'briefing_entrega', 'visita', 'ci', 'ci_foto',
                      'programacao', 'agendamento', 'ponto_midia'));
