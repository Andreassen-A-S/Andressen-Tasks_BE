import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  RecurrenceFrequency,
  TaskGoalType,
  TaskPriority,
  TaskStatus,
  TaskUnit,
} from "../src/generated/prisma/client";

const transactionMock = mock<(fn: (tx: any) => Promise<any>) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    task: { deleteMany: mock(() => Promise.resolve({ count: 0 })) },
  },
}));

const taskRepo = await import("../src/repositories/taskRepository");
const { RecurringTaskService } = await import("../src/services/recurringTaskService");

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
        findFirst: mock(() => Promise.resolve(null)),
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

  test("Prisma schema enforces @@unique([project_id, number]) on tasks", () => {
    const schema = require("fs").readFileSync(
      require("path").join(__dirname, "../prisma/schema.prisma"),
      "utf-8",
    );
    expect(schema).toContain("@@unique([project_id, number])");
  });
});

describe("RecurringTaskService - task numbering", () => {
  const dailyTemplate = {
    id: "template-a",
    title: "Daily task",
    description: "",
    project_id: "project-a",
    created_by: "user-a",
    frequency: RecurrenceFrequency.DAILY,
    interval: 1,
    start_date: new Date("2026-01-01T00:00:00.000Z"),
    end_date: null,
    days_of_week: null,
    day_of_month: null,
    priority: TaskPriority.MEDIUM,
    unit: TaskUnit.NONE,
    goal_type: TaskGoalType.OPEN,
    target_quantity: null,
    is_active: true,
  };

  function makeTx(overrides: Record<string, any> = {}) {
    return {
      recurringTaskTemplate: {
        findUnique: mock(() => Promise.resolve(dailyTemplate)),
      },
      task: {
        findMany: mock(() => Promise.resolve([])),
        createMany: mock(() => Promise.resolve({ count: 0 })),
      },
      recurringTaskTemplateAssignee: {
        findMany: mock(() => Promise.resolve([])),
      },
      taskAssignment: {
        createMany: mock(() => Promise.resolve({ count: 0 })),
      },
      taskEvent: {
        createMany: mock(() => Promise.resolve({ count: 0 })),
      },
      projectTaskCounter: {
        // count=2 → last_number=2, so allocator returns [1, 2]
        upsert: mock(() => Promise.resolve({ last_number: 2 })),
      },
      ...overrides,
    };
  }

  test("generated tasks receive ordered non-zero numbers in createMany payload", async () => {
    const tx = makeTx();
    transactionMock.mockImplementation((fn) => fn(tx));

    await new RecurringTaskService().generateInstances("template-a", 2);

    expect(tx.task.createMany).toHaveBeenCalledTimes(1);
    const { data } = (tx.task.createMany as ReturnType<typeof mock>).mock.calls[0][0] as {
      data: Array<{ number: number }>;
    };
    expect(data).toHaveLength(2);
    expect(data[0].number).toBe(1);
    expect(data[1].number).toBe(2);
    expect(data.every((t) => t.number > 0)).toBe(true);
  });

  test("numbers are assigned in occurrence-date order", async () => {
    const tx = makeTx();
    transactionMock.mockImplementation((fn) => fn(tx));

    await new RecurringTaskService().generateInstances("template-a", 2);

    const { data } = (tx.task.createMany as ReturnType<typeof mock>).mock.calls[0][0] as {
      data: Array<{ number: number; deadline: Date }>;
    };
    expect(data[0].deadline.getTime()).toBeLessThan(data[1].deadline.getTime());
    expect(data[0].number).toBeLessThan(data[1].number);
  });

  test("skips generation when template is inactive", async () => {
    const tx = makeTx({
      recurringTaskTemplate: {
        findUnique: mock(() => Promise.resolve({ ...dailyTemplate, is_active: false })),
      },
    });
    transactionMock.mockImplementation((fn) => fn(tx));

    await new RecurringTaskService().generateInstances("template-a", 2);

    expect(tx.task.createMany).not.toHaveBeenCalled();
  });
});
