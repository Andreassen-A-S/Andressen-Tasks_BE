import { afterEach, describe, expect, mock, test } from "bun:test";
import { TaskPriority, TaskStatus } from "../src/generated/prisma/client";

const transactionMock = mock<(...args: any[]) => Promise<any>>();
const deleteManyMock = mock<(...args: any[]) => Promise<{ count: number }>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    task: {
      deleteMany: deleteManyMock,
    },
  },
}));

const taskRepo = await import("../src/repositories/taskRepository");

function createTx(overrides: Record<string, any> = {}) {
  return {
    project: {
      findFirst: mock(() => Promise.resolve({ organization_id: "org-a" })),
    },
    user: {
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve({ role: "USER" })),
    },
    task: {
      findFirst: mock(() => Promise.resolve({
        status: TaskStatus.PENDING,
        project_id: "project-a",
        project: { organization_id: "org-a" },
      })),
      create: mock(() => Promise.resolve({ task_id: "task-a" })),
      update: mock(() => Promise.resolve({ task_id: "task-a" })),
      findUnique: mock(() => Promise.resolve({ task_id: "task-a", assignments: [] })),
    },
    taskAssignment: {
      createMany: mock(() => Promise.resolve({ count: 0 })),
      findMany: mock(() => Promise.resolve([])),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
      updateMany: mock(() => Promise.resolve({ count: 0 })),
      findUnique: mock(() => Promise.resolve({ assignment_id: "assignment-a" })),
      upsert: mock(() => Promise.resolve({ assignment_id: "assignment-a" })),
    },
    taskProgressLog: {
      create: mock(() => Promise.resolve({ progress_id: "progress-a" })),
    },
    ...overrides,
  };
}

afterEach(() => {
  mock.restore();
  transactionMock.mockReset();
  deleteManyMock.mockReset();
});

describe("taskRepository organization boundaries", () => {
  test("createTaskWithAssignments rejects assignees outside the project organization", async () => {
    const tx = createTx({
      user: {
        findMany: mock(() => Promise.resolve([{ user_id: "user-a" }])),
      },
    });

    await expect(taskRepo.createTaskWithAssignments(tx as any, {
      title: "Task",
      description: "",
      priority: TaskPriority.MEDIUM,
      deadline: new Date("2026-01-01"),
      start_date: new Date("2026-01-01"),
      created_by: "admin-a",
      project_id: "project-a",
      assigned_users: ["user-a", "user-b"],
    }, "org-a")).rejects.toThrow("Assigned users must belong to the task organization.");

    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { project_id: "project-a", organization_id: "org-a" },
      select: { organization_id: true },
    });
  });

  test("updateTaskPlatform rejects moving a task to a project in another organization", async () => {
    const tx = createTx({
      project: {
        findFirst: mock(() => Promise.resolve({ organization_id: "org-b" })),
      },
    });

    await expect(taskRepo.updateTaskPlatform(
      tx as any,
      "task-a",
      { project_id: "project-b" },
      "admin-a",
    )).rejects.toThrow("Task cannot be moved to a project in another organization.");
  });

  test("deleteTaskInOrg scopes deletion by effective org", async () => {
    const mockDb = { task: { deleteMany: deleteManyMock } };
    deleteManyMock.mockResolvedValue({ count: 1 });
    await taskRepo.deleteTaskInOrg(mockDb as any, "task-a", "org-a");
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { task_id: "task-a", project: { organization_id: "org-a" } },
    });
  });

  test("upsertProgressLogInOrg treats tasks outside the effective org as not found", async () => {
    const tx = createTx({
      task: {
        findFirst: mock(() => Promise.resolve(null)),
      },
    });

    await expect(taskRepo.upsertProgressLogInOrg(
      tx as any,
      "task-b",
      "org-a",
      "user-a",
      1,
      undefined,
      undefined,
    )).rejects.toThrow("Task not found: task-b");

    expect(tx.task.findFirst).toHaveBeenCalledWith({
      where: { task_id: "task-b", project: { organization_id: "org-a" } },
    });
  });
});
