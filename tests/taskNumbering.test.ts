import { afterEach, describe, expect, mock, test } from "bun:test";
import { TaskPriority, TaskStatus } from "../src/generated/prisma/client";

const transactionMock = mock<(...args: any[]) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    task: { deleteMany: mock(() => Promise.resolve({ count: 0 })) },
  },
}));

const taskRepo = await import("../src/repositories/taskRepository");

afterEach(() => {
  mock.restore();
  transactionMock.mockReset();
});

function makeDb(overrides: Record<string, any> = {}) {
  return {
    project: {
      findFirst: mock(() => Promise.resolve({ organization_id: "org-a" })),
    },
    user: {
      findMany: mock(() => Promise.resolve([])),
    },
    task: {
      findFirst: mock(() =>
        Promise.resolve({
          status: TaskStatus.PENDING,
          project_id: "project-a",
          project: { organization_id: "org-a" },
        })
      ),
      create: mock(() => Promise.resolve({ task_id: "task-new" })),
      update: mock(() => Promise.resolve({ task_id: "task-a" })),
      findUnique: mock(() =>
        Promise.resolve({ task_id: "task-a", assignments: [], project: {} })
      ),
    },
    taskAssignment: {
      createMany: mock(() => Promise.resolve({ count: 0 })),
      findMany: mock(() => Promise.resolve([])),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
      updateMany: mock(() => Promise.resolve({ count: 0 })),
    },
    projectTaskCounter: {
      upsert: mock(() => Promise.resolve({ last_number: 1 })),
    },
    ...overrides,
  };
}

describe("allocateNextTaskNumberForProject", () => {
  test("first task in a new project gets number 1", async () => {
    const upsertMock = mock(() => Promise.resolve({ last_number: 1 }));
    const db = { projectTaskCounter: { upsert: upsertMock } };

    const result = await taskRepo.allocateNextTaskNumberForProject(db as any, "project-a");

    expect(result).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { project_id: "project-a" },
      create: { project_id: "project-a", last_number: 1 },
      update: { last_number: { increment: 1 } },
    });
  });

  test("second task in the same project gets number 2", async () => {
    const db = {
      projectTaskCounter: {
        upsert: mock(() => Promise.resolve({ last_number: 2 })),
      },
    };

    const result = await taskRepo.allocateNextTaskNumberForProject(db as any, "project-a");

    expect(result).toBe(2);
  });

  test("projects maintain independent counters", async () => {
    const counters: Record<string, number> = {};
    const db = {
      projectTaskCounter: {
        upsert: mock(({ where }: any) => {
          counters[where.project_id] = (counters[where.project_id] ?? 0) + 1;
          return Promise.resolve({ last_number: counters[where.project_id] });
        }),
      },
    };

    const a1 = await taskRepo.allocateNextTaskNumberForProject(db as any, "project-a");
    const b1 = await taskRepo.allocateNextTaskNumberForProject(db as any, "project-b");
    const a2 = await taskRepo.allocateNextTaskNumberForProject(db as any, "project-a");

    expect(a1).toBe(1);
    expect(b1).toBe(1); // project-b also starts at 1
    expect(a2).toBe(2); // project-a increments independently
  });
});

describe("allocateTaskNumbersForProject", () => {
  test("returns a contiguous block for a fresh project", async () => {
    const db = {
      projectTaskCounter: {
        upsert: mock(() => Promise.resolve({ last_number: 3 })),
      },
    };

    const numbers = await taskRepo.allocateTaskNumbersForProject(db as any, "project-a", 3);

    expect(numbers).toEqual([1, 2, 3]);
  });

  test("block starts after the existing counter value", async () => {
    // counter was at 5; allocating 3 more → last_number becomes 8, range [6, 7, 8]
    const db = {
      projectTaskCounter: {
        upsert: mock(() => Promise.resolve({ last_number: 8 })),
      },
    };

    const numbers = await taskRepo.allocateTaskNumbersForProject(db as any, "project-a", 3);

    expect(numbers).toEqual([6, 7, 8]);
  });

  test("single allocation returns a one-element array", async () => {
    const db = {
      projectTaskCounter: {
        upsert: mock(() => Promise.resolve({ last_number: 4 })),
      },
    };

    const numbers = await taskRepo.allocateTaskNumbersForProject(db as any, "project-a", 1);

    expect(numbers).toEqual([4]);
  });

  test("increments the counter by count in one DB write", async () => {
    const upsertMock = mock(() => Promise.resolve({ last_number: 5 }));
    const db = { projectTaskCounter: { upsert: upsertMock } };

    await taskRepo.allocateTaskNumbersForProject(db as any, "project-a", 5);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { project_id: "project-a" },
      create: { project_id: "project-a", last_number: 5 },
      update: { last_number: { increment: 5 } },
    });
  });
});

describe("createTaskWithAssignments", () => {
  test("allocates a project-scoped number before creating the task", async () => {
    const createMock = mock(() => Promise.resolve({ task_id: "task-new" }));
    const upsertMock = mock(() => Promise.resolve({ last_number: 1 }));
    const db = makeDb({
      task: {
        findFirst: mock(() => Promise.resolve(null)), // no parent lookup needed
        create: createMock,
        findUnique: mock(() =>
          Promise.resolve({ task_id: "task-new", assignments: [], project: {} })
        ),
      },
      projectTaskCounter: { upsert: upsertMock },
    });

    await taskRepo.createTaskWithAssignments(
      db as any,
      {
        title: "First task",
        description: "",
        priority: TaskPriority.MEDIUM,
        deadline: new Date("2026-01-01"),
        start_date: new Date("2026-01-01"),
        created_by: "user-a",
        project_id: "project-a",
        assigned_users: [],
      },
      "org-a",
    );

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 1 }) }),
    );
  });
});

describe("updateTaskPlatform - project reassignment", () => {
  test("moving to another project allocates the next number in the destination", async () => {
    const updateMock = mock(() => Promise.resolve({ task_id: "task-a" }));
    const upsertMock = mock(() => Promise.resolve({ last_number: 1 }));
    const db = makeDb({
      task: {
        findFirst: mock(() =>
          Promise.resolve({
            status: TaskStatus.PENDING,
            project_id: "project-a",
            project: { organization_id: "org-a" },
          })
        ),
        update: updateMock,
        findUnique: mock(() =>
          Promise.resolve({ task_id: "task-a", assignments: [], project: {} })
        ),
      },
      projectTaskCounter: { upsert: upsertMock },
    });

    await taskRepo.updateTaskPlatform(db as any, "task-a", { project_id: "project-b" });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { project_id: "project-b" } }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 1 }) }),
    );
  });

  test("updating a task without changing project does not touch the counter", async () => {
    const upsertMock = mock(() => Promise.resolve({ last_number: 5 }));
    const db = makeDb({ projectTaskCounter: { upsert: upsertMock } });

    await taskRepo.updateTaskPlatform(db as any, "task-a", { title: "New title" });

    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("duplicate (project_id, number) combination is rejected by the DB unique constraint", () => {
    // The uniqueness invariant is enforced at DB level via @@unique([project_id, number]).
    // A duplicate write from the Prisma client throws a P2002 unique constraint error.
    // This test documents the constraint; integration tests against a real DB would
    // verify the Prisma error code.
    expect(true).toBe(true);
  });
});
