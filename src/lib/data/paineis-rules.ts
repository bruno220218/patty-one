/** Pure rules for the Painéis RGB screen (dates are YYYY-MM-DD, local). */

export type VinhetaTipo =
  "venda" | "permuta" | "camp_patty" | "doacao" | "reserva" | "evento" | "indisponivel";

export const VINHETA_TIPOS: { value: VinhetaTipo; label: string }[] = [
  { value: "venda", label: "Venda" },
  { value: "permuta", label: "Permuta" },
  { value: "camp_patty", label: "Camp. Patty" },
  { value: "doacao", label: "Doação/Bonificação" },
  { value: "reserva", label: "Reserva" },
  { value: "evento", label: "Evento" },
  { value: "indisponivel", label: "Indisponível" },
];

export const VINHETA_TIPO_LABEL = Object.fromEntries(
  VINHETA_TIPOS.map((t) => [t.value, t.label]),
) as Record<VinhetaTipo, string>;

/** Days before the end date when a vinheta counts as "vencendo" (same as the old e-mail). */
export const DIAS_AVISO = 7;

export type VinhetaSituacao =
  | { tipo: "indisponivel" }
  | { tipo: "agendada"; dias: number }
  | { tipo: "no_ar" }
  | { tipo: "sem_fim" }
  | { tipo: "vencendo"; dias: number }
  | { tipo: "hoje" }
  | { tipo: "vencida"; dias: number };

const MS_DIA = 86_400_000;

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function diasEntre(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / MS_DIA);
}

export function situacaoVinheta(
  v: { tipo: VinhetaTipo; inicio: string | null; fim: string | null },
  hoje: string,
): VinhetaSituacao {
  if (v.tipo === "indisponivel") return { tipo: "indisponivel" };
  if (v.fim) {
    const dias = diasEntre(hoje, v.fim);
    if (dias < 0) return { tipo: "vencida", dias: -dias };
    if (dias === 0) return { tipo: "hoje" };
    if (dias <= DIAS_AVISO) return { tipo: "vencendo", dias };
  }
  if (v.inicio && diasEntre(hoje, v.inicio) > 0) {
    return { tipo: "agendada", dias: diasEntre(hoje, v.inicio) };
  }
  return v.fim ? { tipo: "no_ar" } : { tipo: "sem_fim" };
}

/** Needs someone's attention (renewal or removal). */
export function precisaAtencao(s: VinhetaSituacao): boolean {
  return s.tipo === "vencendo" || s.tipo === "hoje" || s.tipo === "vencida";
}

export function situacaoLabel(s: VinhetaSituacao): string {
  switch (s.tipo) {
    case "indisponivel":
      return "Indisponível";
    case "agendada":
      return s.dias === 1 ? "Entra amanhã" : `Entra em ${s.dias} dias`;
    case "no_ar":
      return "No ar";
    case "sem_fim":
      return "No ar · sem fim";
    case "vencendo":
      return s.dias === 1 ? "Vence amanhã" : `Vence em ${s.dias} dias`;
    case "hoje":
      return "Vence hoje";
    case "vencida":
      return s.dias === 1 ? "Venceu ontem" : `Vencida há ${s.dias} dias`;
  }
}

/** Free slot numbers (1..espacos) given the occupied positions. */
export function espacosLivres(espacos: number, ocupados: readonly number[]): number[] {
  const usados = new Set(ocupados);
  const livres: number[] = [];
  for (let i = 1; i <= espacos; i++) if (!usados.has(i)) livres.push(i);
  return livres;
}

/** Criação and gestão edit the panels (the database enforces the same rule). */
export function canEditarPaineis(user: { funcoes: readonly string[] } | null | undefined) {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "criacao"));
}

/** Search key that ignores accents and case. */
export const dobrar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
