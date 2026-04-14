import { afterEach, describe, expect, mock, test } from "bun:test";
import { TaskStatus } from "../src/generated/prisma/client";

const findManyMock = mock<(...args: any[]) => Promise<any[]>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    taskAssignment: {
      findMany: findManyMock,
    },
  },
}));

const { getTodayTasksPerUser } = await import("../src/repositories/taskRepository");

function makeAssignment(
  userId: string,
  pushToken: string,
  taskOverrides: Record<string, unknown> = {},
) {
  return {
    user_id: userId,
    user: { user_id: userId, push_token: pushToken },
    task: {
      task_id: `task-${userId}`,
      status: TaskStatus.PENDING,
      start_date: new Date("2026-04-01T00:00:00.000Z"),
      ...taskOverrides,
    },
  };
}

afterEach(() => {
  mock.restore();
  findManyMock.mockReset();
});

describe("getTodayTasksPerUser", () => {
  test("includes overdue tasks (scheduled before today): no lower bound on start_date", async () => {
    findManyMock.mockResolvedValue([
      makeAssignment("u1", "token-u1", {
        task_id: "overdue-task",
        start_date: new Date("2026-03-01T00:00:00.000Z"),
      }),
    ]);

    const result = await getTodayTasksPerUser(new Date("2026-04-01T06:25:00Z"));

    expect(result).toHaveLength(1);
    expect(result[0].tasks[0].task_id).toBe("overdue-task");

    // Intentionally no gte lower bound — overdue tasks have no start_date floor
    const callArg = findManyMock.mock.calls[0][0] as any;
    expect(callArg.where.task.start_date.gte).toBeUndefined();
  });

  test("query excludes DONE, REJECTED, ARCHIVED statuses", async () => {
    findManyMock.mockResolvedValue([]);

    await getTodayTasksPerUser(new Date("2026-04-01T06:25:00Z"));

    const callArg = findManyMock.mock.calls[0][0] as any;
    expect(callArg.where.task.status.notIn).toContain(TaskStatus.DONE);
    expect(callArg.where.task.status.notIn).toContain(TaskStatus.REJECTED);
    expect(callArg.where.task.status.notIn).toContain(TaskStatus.ARCHIVED);
  });

  test("query upper bound is Copenhagen end-of-day (CEST: lt 22:00Z)", async () => {
    findManyMock.mockResolvedValue([]);

    // April 1st 2026 is CEST (UTC+2); start of April 2nd in Copenhagen = 2026-04-01T22:00:00Z (exclusive upper bound)
    await getTodayTasksPerUser(new Date("2026-04-01T06:25:00Z"));

    const callArg = findManyMock.mock.calls[0][0] as any;
    const lt: Date = callArg.where.task.start_date.lt;
    expect(lt.toISOString()).toBe("2026-04-01T22:00:00.000Z");
  });

  test("groups multiple tasks by user", async () => {
    findManyMock.mockResolvedValue([
      makeAssignment("u1", "token-u1", { task_id: "t1" }),
      makeAssignment("u1", "token-u1", { task_id: "t2" }),
      makeAssignment("u2", "token-u2", { task_id: "t3" }),
    ]);

    const result = await getTodayTasksPerUser(new Date("2026-04-01T06:25:00Z"));

    expect(result).toHaveLength(2);
    const u1 = result.find((r) => r.user_id === "u1")!;
    expect(u1.tasks).toHaveLength(2);
    expect(u1.push_token).toBe("token-u1");
    const u2 = result.find((r) => r.user_id === "u2")!;
    expect(u2.tasks).toHaveLength(1);
  });

  test("returns empty array when no assignments found", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await getTodayTasksPerUser(new Date("2026-04-01T06:25:00Z"));

    expect(result).toHaveLength(0);
  });
});
