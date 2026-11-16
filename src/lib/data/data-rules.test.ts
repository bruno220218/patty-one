import { describe, expect, it } from "vitest";
import { canToggleTask, moveItem, projectProgress, projectStatus, requireText } from "./rules";

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
