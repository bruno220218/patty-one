import { describe, expect, it } from "vitest";
import {
  ALL_TIME,
  buildIndicators,
  buildLiberacaoIndicators,
  formatHoras,
  monthPeriod,
} from "./report";

const at = (date: string) => `${date}T15:00:00Z`;
const t = (date: string | null, who = "Ana") => ({
  completedAt: date ? at(date) : null,
  completedBy: date ? { name: who } : null,
});
const proj = (
  name: string,
  created: string,
  dueDate: string | null,
  tasks: ReturnType<typeof t>[],
  archived = false,
) => ({
  id: name,
  name,
  createdAt: at(created),
  dueDate,
  archived,
  tasks,
});

const projects = [
  proj("USIPA", "2026-11-02", "2026-11-27", [t("2026-11-05", "Irauan"), t(null)]),
  proj(
    "GNV",
    "2026-11-03",
    "2026-11-10",
    [t("2026-11-08", "Ana"), t("2026-11-12", "Irauan")],
    true,
  ),
  proj("Marq", "2026-11-04", "2026-11-20", [t("2026-11-06", "Ana")]),
  proj("Outubro", "2026-10-01", "2026-10-31", [t("2026-10-15", "Ana")]),
  proj("usipa", "2026-11-09", null, [t("2026-11-09", "Ana")]),
  proj("Dezembro", "2026-12-01", null, [t(null)]),
];

describe("report indicators", () => {
  const nov = buildIndicators(projects, monthPeriod("2026-11"), "2026-11-16");

  it("counts distinct clients created in the month", () => {
    expect(nov.clients).toEqual({ count: 3, names: ["GNV", "Marq", "USIPA"] });
  });

  it("counts tasks completed in the month per person", () => {
    expect(nov.tasksByPerson).toEqual([
      { name: "Ana", count: 3 },
      { name: "Irauan", count: 2 },
    ]);
    expect(nov.tasksTotal).toBe(5);
  });

  it("splits deliveries into on time, late and without due date", () => {
    expect(nov.onTime.map((r) => r.name)).toEqual(["Marq"]);
    expect(nov.late).toEqual([
      {
        name: "GNV",
        serviceType: "",
        dueDate: "2026-11-10",
        deliveredOn: "2026-11-12",
        daysLate: 2,
      },
    ]);
    expect(nov.noDueDate.map((r) => r.name)).toEqual(["usipa"]);
  });

  it("lists unfinished projects created up to the period end", () => {
    expect(nov.open.map((r) => [r.name, r.percent, r.overdue])).toEqual([["USIPA", 50, false]]);
    expect(buildIndicators(projects, ALL_TIME, "2026-11-30").open.map((r) => r.name)).toEqual([
      "USIPA",
      "Dezembro",
    ]);
  });

  it("labels months in Portuguese", () => {
    expect(monthPeriod("2026-02")).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
      label: "Fevereiro de 2026",
    });
  });
});

describe("liberação indicators", () => {
  const ev = (liberacaoId: string, tipo: string, createdAt: string) => ({
    liberacaoId,
    tipo,
    createdAt,
  });
  const libs = [
    { id: "a", numero: 1, cliente: "CENIBRA", status: "aprovada" },
    { id: "b", numero: 2, cliente: "GNV", status: "aprovada" },
    { id: "c", numero: 3, cliente: "USIPA", status: "reprovada" },
    { id: "d", numero: 4, cliente: "MARQ", status: "aguardando" },
  ];
  const eventos = [
    // a: aprovada de primeira, 4h na fila
    ev("a", "criada", "2026-11-03T12:00:00Z"),
    ev("a", "aprovada", "2026-11-03T16:00:00Z"),
    // b: reprovada (2h), reenviada, aprovada (10h)
    ev("b", "criada", "2026-11-04T12:00:00Z"),
    ev("b", "reprovada", "2026-11-04T14:00:00Z"),
    ev("b", "reenviada", "2026-11-05T12:00:00Z"),
    ev("b", "aprovada", "2026-11-05T22:00:00Z"),
    // c: reprovada duas vezes (6h e 2h)
    ev("c", "criada", "2026-11-06T12:00:00Z"),
    ev("c", "reprovada", "2026-11-06T18:00:00Z"),
    ev("c", "reenviada", "2026-11-07T12:00:00Z"),
    ev("c", "reprovada", "2026-11-07T14:00:00Z"),
    // d: criada em outubro, ainda na fila
    ev("d", "criada", "2026-10-30T12:00:00Z"),
  ];

  it("counts creations, approvals, rejections and first-time approvals in the period", () => {
    const r = buildLiberacaoIndicators(libs, eventos, monthPeriod("2026-11"));
    expect(r.criadas).toBe(3);
    expect(r.aprovadas).toBe(2);
    expect(r.reprovacoes).toBe(3);
    expect(r.aprovadasDePrimeira).toBe(1);
    expect(r.horasMediasNaFila).toBeCloseTo((4 + 2 + 10 + 6 + 2) / 5);
    expect(r.naFilaAgora).toBe(1);
    expect(r.emEdicaoAgora).toBe(1);
    expect(r.maisReprovadas).toEqual([
      { numero: 3, cliente: "USIPA", vezes: 2 },
      { numero: 2, cliente: "GNV", vezes: 1 },
    ]);
  });

  it("formats hours", () => {
    expect(formatHoras(null)).toBe("—");
    expect(formatHoras(4.8)).toBe("5 h");
    expect(formatHoras(0.2)).toBe("1 h");
    expect(formatHoras(24)).toBe("1 dia");
    expect(formatHoras(52)).toBe("2 dias e 4 h");
  });
});
