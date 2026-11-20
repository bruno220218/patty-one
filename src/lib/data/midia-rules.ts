/**
 * Mídia OOH (vinda do PattyOne): official bi-weekly calendar, occupancy filters and point
 * validation. Pure functions, tested in midia-rules.test.ts.
 */
import type { CurrentUser } from "./types";

export const STATUS_PONTO = ["Ativo", "Inativo", "Em manutenção"] as const;
export type StatusPonto = (typeof STATUS_PONTO)[number];

export type StatusOcupacao = "Livre" | "Reservado" | "Ocupado";
export const TODOS_STATUS_OCUPACAO: StatusOcupacao[] = ["Livre", "Reservado", "Ocupado"];
/** A click on a cell cycles Livre → Reservado → Ocupado → Livre. */
export const PROXIMO_STATUS: Record<StatusOcupacao, StatusOcupacao> = {
  Livre: "Reservado",
  Reservado: "Ocupado",
  Ocupado: "Livre",
};

/** Gestão, Comercial and PCP edit points (database rule: can_editar_midia). */
export function canEditarMidia(user: CurrentUser | null | undefined): boolean {
  return Boolean(user && user.funcoes.some((f) => ["gestor", "comercial", "pcp"].includes(f)));
}

/** Gestão and Comercial reserve/occupy bi-weeks (database rule: can_marcar_ocupacao). */
export function canMarcarOcupacao(user: CurrentUser | null | undefined): boolean {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "comercial"));
}

// ---------- Calendário ----------

export type PeriodoOficial = {
  ano: number;
  numero: number;
  codigoSige: number;
  inicio: string;
  fim: string;
};

export function bissemanasDoAno(
  ano: number,
  calendario: readonly PeriodoOficial[],
): PeriodoOficial[] {
  return calendario.filter((b) => b.ano === ano).sort((a, b) => a.numero - b.numero);
}

/** The period containing `hojeISO` ("YYYY-MM-DD"); numero 0 when the calendar doesn't cover it. */
export function bissemanaAtual(
  hojeISO: string,
  calendario: readonly PeriodoOficial[],
): { ano: number; numero: number } {
  const p = calendario.find((b) => hojeISO >= b.inicio && hojeISO <= b.fim);
  return p ? { ano: p.ano, numero: p.numero } : { ano: Number(hojeISO.slice(0, 4)), numero: 0 };
}

/** "2026-11-02" → "02/11". */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const rotuloBissemana = (b: PeriodoOficial) =>
  `B${b.codigoSige} · ${diaMes(b.inicio)}–${diaMes(b.fim)}`;

// ---------- Ocupação ----------

export type OcupacaoLinha = {
  pontoId: string;
  bissemana: number;
  status: string;
  cliente: string | null;
};
export type MapaOcupacao = Map<string, OcupacaoLinha>;

export const chaveOcupacao = (pontoId: string, bissemana: number) => `${pontoId}:${bissemana}`;

export function criarMapaOcupacao(linhas: readonly OcupacaoLinha[]): MapaOcupacao {
  return new Map(linhas.map((l) => [chaveOcupacao(l.pontoId, l.bissemana), l]));
}

/** No row (or an unknown status) means Livre. */
export function statusDoPonto(
  mapa: MapaOcupacao,
  pontoId: string,
  bissemana: number,
): StatusOcupacao {
  const s = mapa.get(chaveOcupacao(pontoId, bissemana))?.status;
  return s === "Reservado" || s === "Ocupado" ? s : "Livre";
}

/** Points whose situation in the bi-week is one of `statuses`; none chosen = all. */
export function filtrarPorOcupacao<T extends { id: string }>(
  pontos: readonly T[],
  mapa: MapaOcupacao,
  bissemana: number,
  statuses: readonly StatusOcupacao[],
): T[] {
  if (!statuses.length) return [...pontos];
  const q = new Set(statuses);
  return pontos.filter((p) => q.has(statusDoPonto(mapa, p.id, bissemana)));
}

export function contarPorStatus(
  pontos: readonly { id: string }[],
  mapa: MapaOcupacao,
  bissemana: number,
): Record<StatusOcupacao, number> {
  const t: Record<StatusOcupacao, number> = { Livre: 0, Reservado: 0, Ocupado: 0 };
  for (const p of pontos) t[statusDoPonto(mapa, p.id, bissemana)]++;
  return t;
}

export function alternarStatus(
  statuses: readonly StatusOcupacao[],
  s: StatusOcupacao,
): StatusOcupacao[] {
  return statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
}

// ---------- Ponto ----------

/** Accepts "-23,5505" or "-23.5505"; null when empty; "invalido" when out of range. */
export function parseCoord(valor: string, tipo: "lat" | "lng"): number | null | "invalido" {
  const t = valor.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  const max = tipo === "lat" ? 90 : 180;
  if (!Number.isFinite(n) || Math.abs(n) > max) return "invalido";
  return Math.round(n * 1e6) / 1e6;
}

/** "3,5" → 3.5; empty → null; "invalido" when not a positive number. */
export function parseMedida(valor: string): number | null | "invalido" {
  const t = valor.trim().replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : "invalido";
}

export type PontoForm = {
  codigo: string;
  nome: string;
  tipoId: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string;
  latitude: string;
  longitude: string;
  faces: string;
  largura: string;
  altura: string;
  iluminado: boolean;
  status: StatusPonto;
  observacao: string;
};

/** First problem that blocks saving, or null. */
export function validarPonto(f: PontoForm): string | null {
  if (!f.nome.trim()) return "Informe o nome do ponto.";
  if (!f.tipoId) return "Escolha o tipo de mídia.";
  const lat = parseCoord(f.latitude, "lat");
  const lng = parseCoord(f.longitude, "lng");
  if (lat === "invalido" || lng === "invalido") return "Coordenadas inválidas.";
  if ((lat === null) !== (lng === null)) return "Informe latitude e longitude juntas.";
  if (!/^\d+$/.test(f.faces.trim()) || Number(f.faces) < 1) return "Faces deve ser 1 ou mais.";
  if (parseMedida(f.largura) === "invalido" || parseMedida(f.altura) === "invalido")
    return "Largura e altura precisam ser números maiores que zero.";
  if (f.estado.trim() && !/^[A-Za-z]{2}$/.test(f.estado.trim())) return "UF deve ter 2 letras.";
  return null;
}

/** Google Maps link for a point (opens the app on phones). */
export function linkMapa(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
