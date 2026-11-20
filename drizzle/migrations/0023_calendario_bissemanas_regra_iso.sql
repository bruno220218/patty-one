-- Corrige a regra do calendário de bi-semanas (0022) com o calendário exportado do PattyOne.
-- A regra antiga ("a bi-semana 1 é a que contém 1º de janeiro") errava 2020 a 2023: o ciclo
-- de 21/12/2020 a 03/01/2021 é a B54 de 2020, não a B2 de 2021. A regra certa: cada ciclo de
-- 14 dias pertence ao ano ISO do seu último dia (o domingo). Confere com as 235 bi-semanas do
-- PattyOne de 2019 a 2027 (2020 com 27; 2021 começando em 04/01/2021).
-- Ocupações já marcadas continuam no mesmo período (são remapeadas pela data de início).

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
    -- Ciclo que contém 1º de janeiro; se ele termina ainda no ano ISO anterior, o ano começa no seguinte.
    b1 := ancora + (floor((make_date(a, 1, 1) - ancora) / 14.0) * 14)::integer;
    if extract(isoyear from b1 + 13)::integer < a then b1 := b1 + 14; end if;
    prox := ancora + (floor((make_date(a + 1, 1, 1) - ancora) / 14.0) * 14)::integer;
    if extract(isoyear from prox + 13)::integer < a + 1 then prox := prox + 14; end if;
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

-- Refaz os anos já gerados e leva cada ocupação para o mesmo período (mesma data de início).
do $$
declare
  ano_min integer;
  ano_max integer;
begin
  select min(ano), max(ano) into ano_min, ano_max from public.calendario_bissemanas;
  if ano_min is null then return; end if;

  create temp table _ocupacao_antiga on commit drop as
    select o.*, c.inicio
      from public.pontos_ocupacao o
      join public.calendario_bissemanas c on c.ano = o.ano and c.numero = o.bissemana;

  delete from public.calendario_bissemanas;
  perform public.gerar_calendario_bissemanas(ano_min, ano_max);

  delete from public.pontos_ocupacao o using _ocupacao_antiga v where o.id = v.id;
  insert into public.pontos_ocupacao (id, ponto_id, ano, bissemana, status, cliente, observacao,
    updated_by, updated_by_nome, created_at, updated_at)
  select v.id, v.ponto_id, c.ano, c.numero, v.status, v.cliente, v.observacao,
         v.updated_by, v.updated_by_nome, v.created_at, v.updated_at
    from _ocupacao_antiga v
    join public.calendario_bissemanas c on c.inicio = v.inicio;
end;
$$;

select ano, count(*) as bissemanas, min(inicio) as primeira, max(fim) as ultima
  from public.calendario_bissemanas group by ano order by ano;
