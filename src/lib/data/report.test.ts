import { describe, expect, it } from "vitest";
import { buildIndicators, monthPeriod, ALL_TIME } from "./report";

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
