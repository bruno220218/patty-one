import { useMemo } from "react";
import { usePaineis, usePessoasDaFuncao, useCurrentUser } from "@/hooks/use-data";

/** Name suggestions for the CI form: representatives (comercial) and who inserts (criação). */
export function useNomesCi() {
  const { data: me } = useCurrentUser();
  const on = Boolean(me?.isMember);
  const { data: comerciais = [] } = usePessoasDaFuncao(["comercial"], on);
  const { data: criacao = [] } = usePessoasDaFuncao(["criacao"], on);
  const { data: snap } = usePaineis();
  return useMemo(() => {
    const reps = new Set<string>();
    for (const v of snap?.vinhetas ?? []) if (v.representanteNome) reps.add(v.representanteNome);
    for (const p of comerciais) reps.add(p.nome);
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      representantes: sort(reps),
      responsaveis: sort(new Set(criacao.map((p) => p.nome))),
    };
  }, [snap, comerciais, criacao]);
}
