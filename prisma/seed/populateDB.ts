/* prisma/seed.ts */
import {
  PrismaClient,
  UserRole,
  TaskPriority,
  TaskStatus,
  TaskUnit,
  TaskGoalType,
  TaskEventType,
} from "../../src/generated/prisma/client";
import bcrypt from "bcrypt";
import {
  startOfWeek,
  addDays,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from "date-fns";

const prisma = new PrismaClient();

function atTime(d: Date, h: number, m: number) {
  let x = new Date(d);
  x = setHours(x, h);
  x = setMinutes(x, m);
  x = setSeconds(x, 0);
  x = setMilliseconds(x, 0);
  return x;
}

async function main() {
  await prisma.$transaction(async (tx) => {
    // Clean existing data (order matters due to FK constraints)
    await tx.taskEvent.deleteMany();
    await tx.taskProgressLog.deleteMany();
    await tx.taskComment.deleteMany();
    await tx.taskAssignment.deleteMany();
    await tx.task.deleteMany();
    await tx.recurringTaskTemplateAssignee.deleteMany();
    await tx.recurringTaskTemplate.deleteMany();
    await tx.user.deleteMany();

    // Passwords (credentials stay the same)
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const simpleHash = await bcrypt.hash("123", 10);

    // Users
    const [henrik, tommy, christian, sebastian, rasmus, viktor] =
      await Promise.all([
        tx.user.create({
          data: {
            name: "Henrik Andreassen",
            email: "henrik@andreassen.dk",
            password: passwordHash,
            role: UserRole.ADMIN,
            position: "CEO",
          },
        }),
        tx.user.create({
          data: {
            name: "Tommy Liberkind",
            email: "tommy@andreassen.dk",
            password: passwordHash,
            role: UserRole.USER,
            position: "Håndmand",
          },
        }),
        tx.user.create({
          data: {
            name: "Christian Larsen",
            email: "christian@andreassen.dk",
            password: passwordHash,
            role: UserRole.USER,
            position: "Maskinfører",
          },
        }),
        tx.user.create({
          data: {
            name: "Sebastian Bartoldy",
            email: "sebastian@andreassen.dk",
            password: passwordHash,
            role: UserRole.USER,
            position: "Håndmand",
          },
        }),
        tx.user.create({
          data: {
            name: "Rasmus Taul",
            email: "rasmus@andreassen.dk",
            password: simpleHash,
            role: UserRole.ADMIN,
            position: "Håndmand",
          },
        }),
        tx.user.create({
          data: {
            name: "Viktor Andreassen",
            email: "viktor@andreassen.dk",
            password: simpleHash,
            role: UserRole.USER,
            position: "Håndmand",
          },
        }),
      ]);

    // Helpers
    async function createTask(data: any, actorId: string) {
      const task = await tx.task.create({ data });
      await tx.taskEvent.create({
        data: {
          task_id: task.task_id,
          actor_id: actorId,
          type: TaskEventType.TASK_CREATED,
          message: "Task created",
        },
      });
      return task;
    }

    async function createAssignment(params: {
      taskId: string;
      userId: string;
      actorId: string;
      assignedAt?: Date;
    }) {
      const a = await tx.taskAssignment.create({
        data: {
          task_id: params.taskId,
          user_id: params.userId,
          assigned_at: params.assignedAt ?? new Date(),
        },
      });

      await tx.taskEvent.create({
        data: {
          task_id: params.taskId,
          actor_id: params.actorId,
          type: TaskEventType.ASSIGNMENT_CREATED,
          message: "Assignment created",
          assignment_id: a.assignment_id,
          after_json: { user_id: params.userId } as any,
        },
      });

      return a;
    }

    async function markDone(params: {
      taskId: string;
      completerId: string;
      completedAt: Date;
      actorId?: string;
    }) {
      const updated = await tx.task.update({
        where: { task_id: params.taskId },
        data: {
          status: TaskStatus.DONE,
          completed_by: params.completerId,
          completed_at: params.completedAt,
        },
      });

      // Keep your existing behavior: assignment.completed_at gets set for all assignees
      await tx.taskAssignment.updateMany({
        where: { task_id: params.taskId },
        data: { completed_at: params.completedAt },
      });

      await tx.taskEvent.create({
        data: {
          task_id: params.taskId,
          actor_id: params.actorId ?? params.completerId,
          type: TaskEventType.TASK_STATUS_CHANGED,
          message: "Status changed to DONE",
          before_json: { status: TaskStatus.PENDING } as any,
          after_json: {
            status: TaskStatus.DONE,
            completed_by: params.completerId,
          } as any,
        },
      });

      return updated;
    }

    async function addComment(params: {
      taskId: string;
      userId: string;
      message: string;
    }) {
      const c = await tx.taskComment.create({
        data: {
          task_id: params.taskId,
          user_id: params.userId,
          message: params.message,
        },
      });

      await tx.taskEvent.create({
        data: {
          task_id: params.taskId,
          actor_id: params.userId,
          type: TaskEventType.COMMENT_CREATED,
          message: "Comment created",
          comment_id: c.comment_id,
        },
      });

      return c;
    }

    // Dates: make “planned this week” meaningful relative to current time
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const nextWeekStart = addDays(weekStart, 7);

    // Create tasks (some planned this week, some next week, some overdue)
    const t1 = await createTask(
      {
        created_by: henrik.user_id,
        title: "Læg rør 100m (mål)",
        description: "Læg 100 meter rør. Registrer fremskridt i meter.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: addDays(now, 2),
        scheduled_date: atTime(addDays(weekStart, 1), 8, 0), // Tue this week
        goal_type: TaskGoalType.FIXED,
        unit: TaskUnit.METERS,
        target_quantity: 100,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const t2 = await createTask(
      {
        created_by: henrik.user_id,
        title: "Tjek materiel på pladsen",
        description: "Gennemgå værktøj/materiel og meld mangler til lager.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        deadline: addDays(now, 1),
        scheduled_date: atTime(addDays(weekStart, 2), 12, 0), // Wed this week
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const t3 = await createTask(
      {
        created_by: henrik.user_id,
        title: "Ryd op i container",
        description:
          "Sorter materialer, smid affald ud og gør klar til næste levering.",
        priority: TaskPriority.LOW,
        status: TaskStatus.PENDING,
        deadline: addDays(now, 4),
        scheduled_date: atTime(addDays(weekStart, 4), 14, 0), // Fri this week
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const t4 = await createTask(
      {
        created_by: henrik.user_id,
        title: "Fordel stabilgrus 2.5 km (mål)",
        description:
          "Fordel stabilgrus på strækning. Registrer fremskridt i kilometer.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        deadline: addDays(now, 10),
        scheduled_date: atTime(addDays(nextWeekStart, 1), 8, 0), // Tue next week
        goal_type: TaskGoalType.FIXED,
        unit: TaskUnit.KILOMETERS,
        target_quantity: 2.5,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const t5_overdue = await createTask(
      {
        created_by: henrik.user_id,
        title: "Forbered ugentlig rapport",
        description: "Indsaml data og udarbejd ugentlig rapport.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: addDays(now, -2), // overdue
        scheduled_date: atTime(addDays(weekStart, 0), 9, 0), // Mon this week
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    // Assignments (group tasks)
    // Pipe task (t1): tommy + christian + sebastian + viktor
    await createAssignment({
      taskId: t1.task_id,
      userId: tommy.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -14),
    });
    await createAssignment({
      taskId: t1.task_id,
      userId: christian.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -14),
    });
    await createAssignment({
      taskId: t1.task_id,
      userId: sebastian.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -14),
    });
    await createAssignment({
      taskId: t1.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -14),
    });

    // Equipment (t2): tommy + viktor
    await createAssignment({
      taskId: t2.task_id,
      userId: tommy.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -10),
    });
    await createAssignment({
      taskId: t2.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -10),
    });

    // Container (t3): sebastian
    await createAssignment({
      taskId: t3.task_id,
      userId: sebastian.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -5),
    });

    // Gravel (t4, next week): viktor + christian
    await createAssignment({
      taskId: t4.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -20),
    });
    await createAssignment({
      taskId: t4.task_id,
      userId: christian.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -20),
    });

    // Report (t5 overdue): henrik + rasmus
    await createAssignment({
      taskId: t5_overdue.task_id,
      userId: henrik.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -30),
    });
    await createAssignment({
      taskId: t5_overdue.task_id,
      userId: rasmus.user_id,
      actorId: henrik.user_id,
      assignedAt: addDays(now, -30),
    });

    // Mark some tasks done (credit ONLY to the completer)
    // Viktor completes t2 this week
    await markDone({
      taskId: t2.task_id,
      completerId: viktor.user_id,
      completedAt: atTime(addDays(weekStart, 2), 16, 30),
    });

    // Tommy completes t1 this week
    await markDone({
      taskId: t1.task_id,
      completerId: tommy.user_id,
      completedAt: atTime(addDays(weekStart, 3), 15, 15),
    });

    // Henrik completes overdue report today (still overdue historically, but DONE now)
    await markDone({
      taskId: t5_overdue.task_id,
      completerId: henrik.user_id,
      completedAt: atTime(now, 10, 5),
    });

    // Comments
    await addComment({
      taskId: t1.task_id,
      userId: henrik.user_id,
      message: "Husk at tage billeder før/efter ved kritiske samlinger.",
    });
    await addComment({
      taskId: t2.task_id,
      userId: tommy.user_id,
      message: "Der mangler handsker i størrelse L.",
    });
    await addComment({
      taskId: t4.task_id,
      userId: viktor.user_id,
      message: "Skal vi bestille ekstra stabilgrus til næste uge?",
    });

    console.log("✅ Seed complete:");
    console.log("Users:");
    console.log("- henrik@andreassen.dk / Password123!");
    console.log("- tommy@andreassen.dk / Password123!");
    console.log("- christian@andreassen.dk / Password123!");
    console.log("- sebastian@andreassen.dk / Password123!");
    console.log("- rasmus@andreassen.dk / 123");
    console.log("- viktor@andreassen.dk / 123");
  });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
