import { afterEach, describe, expect, mock, test } from "bun:test";
import { TaskStatus } from "../src/generated/prisma/client";

const findManyMock = mock<(...args: any[]) => Promise<any[]>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    task: {
      findMany: findManyMock,
    },
  },
}));

const { getStaleDoneTasks } = await import("../src/repositories/taskRepository");

afterEach(() => {
  mock.restore();
  findManyMock.mockReset();
});

describe("getStaleDoneTasks", () => {
  test("queries only DONE status tasks", async () => {
    findManyMock.mockResolvedValue([]);

    await getStaleDoneTasks(7);

    const callArg = findManyMock.mock.calls[0][0] as any;
    expect(callArg.where.status).toBe(TaskStatus.DONE);
  });

  test("cutoff is olderThanDays days before now", async () => {
    findManyMock.mockResolvedValue([]);

    const before = Date.now();
    await getStaleDoneTasks(7);
    const after = Date.now();

    const callArg = findManyMock.mock.calls[0][0] as any;
    const cutoff: Date = callArg.where.completed_at.lt;
    const expectedMs = 7 * 24 * 60 * 60 * 1000;

    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - expectedMs);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - expectedMs);
  });

  test("returns tasks provided by prisma", async () => {
    const fakeTask = { task_id: "t1", status: TaskStatus.DONE, completed_at: new Date("2026-01-01") };
    findManyMock.mockResolvedValue([fakeTask]);

    const result = await getStaleDoneTasks(7);

    expect(result).toHaveLength(1);
    expect(result[0].task_id).toBe("t1");
  });

  test("returns empty array when no stale tasks", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await getStaleDoneTasks(7);

    expect(result).toHaveLength(0);
  });

  test("respects custom olderThanDays value", async () => {
    findManyMock.mockResolvedValue([]);

    const before = Date.now();
    await getStaleDoneTasks(14);
    const after = Date.now();

    const callArg = findManyMock.mock.calls[0][0] as any;
    const cutoff: Date = callArg.where.completed_at.lt;
    const expectedMs = 14 * 24 * 60 * 60 * 1000;

    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - expectedMs);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - expectedMs);
  });
});
