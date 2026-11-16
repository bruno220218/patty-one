import { beforeEach, describe, expect, it } from "vitest";
import { checklistRepository, projectRepository } from "@/lib/data";
import { moveItem, projectProgress, projectStatus } from "./rules";

beforeEach(() => {
  window.localStorage.clear();
});

async function checklistWithTasks(titles: string[], fixedParams = false) {
  const c = await checklistRepository.create({ name: "Modelo", description: "", fixedParams });
  for (const t of titles) await checklistRepository.addTask(c.id, t);
  return (await checklistRepository.get(c.id))!;
}

describe("checklists", () => {
  it("requires a name", async () => {
    await expect(
      checklistRepository.create({ name: "   ", description: "", fixedParams: false }),
    ).rejects.toThrow();
  });

  it("gives every record and task a unique id", async () => {
    const c = await checklistWithTasks(["A", "B"]);
    const copy = await checklistRepository.duplicate(c.id);
    const ids = [c.id, copy.id, ...c.tasks.map((t) => t.id), ...copy.tasks.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reorders tasks up and down", async () => {
    const c = await checklistWithTasks(["A", "B", "C"]);
    const moved = await checklistRepository.moveTask(c.id, c.tasks[2].id, "up");
    expect(moved.tasks.map((t) => t.title)).toEqual(["A", "C", "B"]);
    expect(moveItem(["A", "B"], 0, "up")).toEqual(["A", "B"]);
  });
});

describe("projects created from a checklist", () => {
  it("copies tasks with new ids, all unchecked", async () => {
    const c = await checklistWithTasks(["Impressão", "Acabamento"]);
    const p = await projectRepository.create({
      name: "Projeto",
      description: "",
      dueDate: null,
      checklistId: c.id,
    });
    expect(p.tasks.map((t) => t.title)).toEqual(["Impressão", "Acabamento"]);
    expect(p.tasks.every((t) => t.completedAt === null)).toBe(true);
    const checklistIds = new Set(c.tasks.map((t) => t.id));
    expect(p.tasks.some((t) => checklistIds.has(t.id))).toBe(false);
  });

  it("stays independent from the checklist in both directions", async () => {
    const c = await checklistWithTasks(["A"]);
    const p = await projectRepository.create({
      name: "P",
      description: "",
      dueDate: null,
      checklistId: c.id,
    });
    await checklistRepository.addTask(c.id, "B");
    await checklistRepository.updateTask(c.id, c.tasks[0].id, "A2");
    expect((await projectRepository.get(p.id))!.tasks.map((t) => t.title)).toEqual(["A"]);

    await projectRepository.addTask(p.id, "X");
    await projectRepository.toggleTask(p.id, p.tasks[0].id, true);
    expect((await checklistRepository.get(c.id))!.tasks.map((t) => t.title)).toEqual(["A2", "B"]);
  });

  it("requires a project name", async () => {
    await expect(
      projectRepository.create({ name: "", description: "", dueDate: null, checklistId: null }),
    ).rejects.toThrow();
  });
});

describe("fixed parameters", () => {
  it("locks task changes but allows checking and editing name/description/due date", async () => {
    const c = await checklistWithTasks(["A", "B"], true);
    const p = await projectRepository.create({
      name: "P",
      description: "",
      dueDate: null,
      checklistId: c.id,
    });
    expect(p.locked).toBe(true);
    await expect(projectRepository.addTask(p.id, "X")).rejects.toThrow();
    await expect(projectRepository.updateTask(p.id, p.tasks[0].id, "Y")).rejects.toThrow();
    await expect(projectRepository.removeTask(p.id, p.tasks[0].id)).rejects.toThrow();
    await expect(projectRepository.moveTask(p.id, p.tasks[1].id, "up")).rejects.toThrow();

    const toggled = await projectRepository.toggleTask(p.id, p.tasks[0].id, true);
    expect(toggled.tasks[0].completedAt).not.toBeNull();
    const edited = await projectRepository.update(p.id, {
      name: "Novo",
      description: "Desc",
      dueDate: "2026-11-18",
    });
    expect(edited).toMatchObject({ name: "Novo", description: "Desc", dueDate: "2026-11-18" });
  });

  it("changing the checklist option later does not affect existing projects", async () => {
    const c = await checklistWithTasks(["A"], false);
    const p = await projectRepository.create({
      name: "P",
      description: "",
      dueDate: null,
      checklistId: c.id,
    });
    await checklistRepository.update(c.id, { name: c.name, description: "", fixedParams: true });
    expect((await projectRepository.get(p.id))!.locked).toBe(false);
  });

  it("empty projects are never locked", async () => {
    const p = await projectRepository.create({
      name: "P",
      description: "",
      dueDate: null,
      checklistId: null,
    });
    expect(p.locked).toBe(false);
    expect(p.tasks).toEqual([]);
  });
});

describe("progress and status", () => {
  const task = (done: boolean) => ({ id: "x", title: "t", completedAt: done ? "2026-01-01" : null });

  it("is 0% with no tasks", () => {
    expect(projectProgress([]).percent).toBe(0);
    expect(projectStatus([])).toBe("not_started");
  });

  it("computes percent and status from checked tasks", () => {
    expect(projectProgress([task(true), task(false), task(false), task(false)]).percent).toBe(25);
    expect(projectStatus([task(false), task(false)])).toBe("not_started");
    expect(projectStatus([task(true), task(false)])).toBe("in_progress");
    expect(projectStatus([task(true), task(true)])).toBe("done");
  });

  it("records the completion time when checked and clears it when unchecked", async () => {
    const p = await projectRepository.create({
      name: "P",
      description: "",
      dueDate: null,
      checklistId: null,
    });
    const withTask = await projectRepository.addTask(p.id, "A");
    const checked = await projectRepository.toggleTask(p.id, withTask.tasks[0].id, true);
    expect(Number.isNaN(Date.parse(checked.tasks[0].completedAt!))).toBe(false);
    const unchecked = await projectRepository.toggleTask(p.id, withTask.tasks[0].id, false);
    expect(unchecked.tasks[0].completedAt).toBeNull();
  });
});

describe("archive", () => {
  it("moves projects between active and archived lists", async () => {
    const p = await projectRepository.create({
      name: "P",
      description: "",
      dueDate: null,
      checklistId: null,
    });
    await projectRepository.setArchived(p.id, true);
    expect((await projectRepository.list({ archived: false })).length).toBe(0);
    expect((await projectRepository.list({ archived: true })).map((x) => x.id)).toEqual([p.id]);
    await projectRepository.setArchived(p.id, false);
    expect((await projectRepository.list({ archived: false })).map((x) => x.id)).toEqual([p.id]);
  });
});
