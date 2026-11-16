import { describe, expect, it } from "vitest";
import {
  canToggleTask,
  DEFAULT_PROJECT_FILTERS,
  filterAndSortProjects,
  groupTeamByRole,
  matchingOpenTasks,
  moveItem,
  normalizeClientInfo,
  projectProgress,
  projectStatus,
  requireText,
} from "./rules";
import { formatRelative } from "../format";

const task = (done: boolean) => ({ completedAt: done ? "2026-01-01T10:00:00Z" : null });

describe("progress and status", () => {
  it("is 0% and not started with no tasks", () => {
    expect(projectProgress([]).percent).toBe(0);
    expect(projectStatus([])).toBe("not_started");
  });

  it("computes percent from checked tasks", () => {
    expect(projectProgress([task(true), task(false), task(false), task(false)]).percent).toBe(25);
  });

  it("derives status from checked tasks", () => {
    expect(projectStatus([task(false), task(false)])).toBe("not_started");
    expect(projectStatus([task(true), task(false)])).toBe("in_progress");
    expect(projectStatus([task(true), task(true)])).toBe("done");
  });
});

describe("unchecking", () => {
  it("anyone can check an open task", () => {
    expect(canToggleTask(task(false), false)).toBe(true);
  });

  it("only gestores can uncheck a completed task", () => {
    expect(canToggleTask(task(true), false)).toBe(false);
    expect(canToggleTask(task(true), true)).toBe(true);
  });
});

describe("reordering", () => {
  it("moves items up and down and ignores moves past the edges", () => {
    expect(moveItem(["A", "B", "C"], 2, "up")).toEqual(["A", "C", "B"]);
    expect(moveItem(["A", "B", "C"], 0, "down")).toEqual(["B", "A", "C"]);
    expect(moveItem(["A", "B"], 0, "up")).toEqual(["A", "B"]);
    expect(moveItem(["A", "B"], 1, "down")).toEqual(["A", "B"]);
  });
});

describe("required text", () => {
  it("rejects blank names", () => {
    expect(() => requireText("   ", "obrigatório")).toThrow("obrigatório");
    expect(requireText("  Nome ", "x")).toBe("Nome");
  });
});

describe("client info", () => {
  it("trims text fields and keeps lamination as given", () => {
    expect(
      normalizeClientInfo({
        serviceType: "  Fachada ACM ",
        ledColor: " ",
        paintColors: "Azul",
        adhesiveType: "",
        lamination: false,
      }),
    ).toEqual({
      serviceType: "Fachada ACM",
      ledColor: "",
      paintColors: "Azul",
      adhesiveType: "",
      lamination: false,
    });
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-11-16T12:00:00Z").getTime();
  it("says 'agora' for the last seconds", () => {
    expect(formatRelative("2026-11-16T11:59:40Z", now)).toBe("agora");
  });
  it("uses minutes and hours", () => {
    expect(formatRelative("2026-11-16T11:55:00Z", now)).toBe("há 5 minutos");
    expect(formatRelative("2026-11-16T09:00:00Z", now)).toBe("há 3 horas");
  });
});

describe("team grouping", () => {
  const p = (name: string, isMember: boolean, isGestor: boolean) => ({ name, isMember, isGestor });

  it("groups pending, then gestores, then membros, each alphabetically", () => {
    const groups = groupTeamByRole([
      p("Projetos Patty", true, false),
      p("bruno Henrique", true, true),
      p("Zé Novo", false, false),
      p("Atendimento Patty", true, true),
      p("Irauan Brum", true, false),
      p("Ágata", false, false),
    ]);
    expect(groups.map((g) => g.role)).toEqual(["pendente", "gestor", "membro"]);
    expect(groups.map((g) => g.people.map((x) => x.name))).toEqual([
      ["Ágata", "Zé Novo"],
      ["Atendimento Patty", "bruno Henrique"],
      ["Irauan Brum", "Projetos Patty"],
    ]);
  });

  it("omits empty groups", () => {
    expect(groupTeamByRole([p("Ana", true, false)]).map((g) => g.role)).toEqual(["membro"]);
  });
});

describe("project filters", () => {
  const today = "2026-11-16";
  const tasks = (done: number, total: number) =>
    Array.from({ length: total }, (_, i) => task(i < done));
  const proj = (
    name: string,
    dueDate: string | null,
    done: number,
    total: number,
    serviceType = "",
  ) => ({
    name,
    dueDate,
    tasks: tasks(done, total),
    clientInfo: { serviceType },
  });
  const all = [
    proj("USIPA", "2026-11-27", 3, 13),
    proj("GNV", "2026-11-30", 2, 8, "Fachada ACM"),
    proj("Marq Acessórios", "2026-11-20", 2, 6),
    proj("Atrasado", "2026-11-10", 1, 4),
    proj("Entregue", "2026-11-01", 4, 4),
    proj("Sem prazo", null, 0, 3),
  ];
  const names = (f: Partial<typeof DEFAULT_PROJECT_FILTERS>) =>
    filterAndSortProjects(all, { ...DEFAULT_PROJECT_FILTERS, ...f }, today).map((p) => p.name);

  it("sorts by nearest due date by default, no due date last", () => {
    expect(names({})).toEqual([
      "Entregue",
      "Atrasado",
      "Marq Acessórios",
      "USIPA",
      "GNV",
      "Sem prazo",
    ]);
    expect(names({ sort: "prazo_desc" }).at(-1)).toBe("Sem prazo");
  });

  it("searches name and service type ignoring accents and case", () => {
    expect(names({ query: "acessorios" })).toEqual(["Marq Acessórios"]);
    expect(names({ query: "acm" })).toEqual(["GNV"]);
  });

  it("filters by due window; overdue excludes finished projects", () => {
    expect(names({ due: "atrasados" })).toEqual(["Atrasado"]);
    expect(names({ due: "7dias" })).toEqual(["Marq Acessórios"]);
    expect(names({ due: "sem_prazo" })).toEqual(["Sem prazo"]);
  });

  it("filters and sorts by production %", () => {
    expect(names({ progress: "0-25" })).toEqual(["USIPA", "Sem prazo"]);
    expect(names({ progress: "100" })).toEqual(["Entregue"]);
    expect(names({ sort: "producao_desc" }).slice(0, 2)).toEqual(["Entregue", "Marq Acessórios"]);
    expect(names({ sort: "nome_asc" })[0]).toBe("Atrasado");
  });
});

describe("open task filter", () => {
  const today = "2026-11-16";
  const t = (title: string, done: boolean) => ({
    title,
    completedAt: done ? "2026-11-10T10:00:00Z" : null,
  });
  const projects = [
    { name: "AGITO", dueDate: null, tasks: [t("Arte aprovada", true), t("Instalação", false)] },
    { name: "GNV", dueDate: null, tasks: [t("Instalação", true), t("Corte ACM", false)] },
    { name: "USIPA", dueDate: null, tasks: [t("Instalacao fachada", false), t("Pintura", false)] },
  ];
  const names = (openTask: string) =>
    filterAndSortProjects(
      projects,
      { ...DEFAULT_PROJECT_FILTERS, sort: "nome_asc", openTask },
      today,
    ).map((p) => p.name);

  it("keeps only projects with a matching task still open (accent/case-insensitive)", () => {
    expect(names("instalação")).toEqual(["AGITO", "USIPA"]);
    expect(names("CORTE")).toEqual(["GNV"]);
    expect(names("arte aprovada")).toEqual([]);
    expect(names("  ")).toEqual(["AGITO", "GNV", "USIPA"]);
  });

  it("lists the matching open task titles", () => {
    expect(matchingOpenTasks(projects[2]!, "instal")).toEqual(["Instalacao fachada"]);
    expect(matchingOpenTasks(projects[0]!, "")).toEqual([]);
  });
});
