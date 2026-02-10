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

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    // Clean existing data (order matters due to FK constraints)
    await tx.taskEvent.deleteMany();
    await tx.taskProgressLog.deleteMany();
    await tx.taskComment.deleteMany();
    await tx.taskAssignment.deleteMany();
    await tx.task.deleteMany();
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

    // Helper: create task + TASK_CREATED event
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

    // Helper: create subtask + SUBTASK_ADDED event on parent
    async function createSubtask(params: {
      parentTaskId: string;
      data: any;
      actorId: string;
    }) {
      const { parentTaskId, data, actorId } = params;
      const subtask = await createTask(
        { ...data, parent_task_id: parentTaskId },
        actorId,
      );

      await tx.taskEvent.create({
        data: {
          task_id: parentTaskId,
          actor_id: actorId,
          type: TaskEventType.SUBTASK_ADDED,
          message: "Subtask added",
          after_json: {
            subtask_id: subtask.task_id,
            title: subtask.title,
          } as any,
        },
      });

      return subtask;
    }

    // Helper: create assignment + ASSIGNMENT_CREATED event
    async function createAssignment(params: {
      taskId: string;
      userId: string;
      actorId: string;
    }) {
      const a = await tx.taskAssignment.create({
        data: { task_id: params.taskId, user_id: params.userId },
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

    // Helper: create progress log + PROGRESS_LOGGED event (links progress_id + assignment_id)
    async function createProgress(params: {
      assignmentId: string;
      actorId: string;
      qty: number;
      note?: string;
    }) {
      const p = await tx.taskProgressLog.create({
        data: {
          assignment_id: params.assignmentId,
          quantity_done: params.qty,
          note: params.note,
        },
      });

      const assignment = await tx.taskAssignment.findUnique({
        where: { assignment_id: params.assignmentId },
        select: { task_id: true, assignment_id: true },
      });
      if (!assignment)
        throw new Error("Assignment not found for progress seed");

      await tx.taskEvent.create({
        data: {
          task_id: assignment.task_id,
          actor_id: params.actorId,
          type: TaskEventType.PROGRESS_LOGGED,
          message: "Progress logged",
          assignment_id: assignment.assignment_id,
          progress_id: p.progress_id,
          after_json: { quantity_done: p.quantity_done, note: p.note } as any,
        },
      });

      return { progress: p, taskId: assignment.task_id };
    }

    // --------------------------
    // Create tasks (more + varied)
    // --------------------------

    const pipeTask = await createTask(
      {
        created_by: henrik.user_id,
        title: "Læg rør 100m (mål)",
        description:
          "Læg 100 meter rør. Medarbejdere registrerer løbende fremskridt i meter.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-20T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-10T08:00:00.000Z"),
        goal_type: TaskGoalType.FIXED,
        unit: TaskUnit.METERS,
        target_quantity: 100,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const reportTask = await createTask(
      {
        created_by: henrik.user_id,
        title: "Forbered ugentlig rapport",
        description:
          "Indsaml data fra alle afdelinger og udarbejd den ugentlige rapport.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-14T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-11T08:00:00.000Z"),
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const equipmentTask = await createTask(
      {
        created_by: henrik.user_id,
        title: "Tjek materiel på pladsen",
        description: "Gennemgå værktøj/materiel og meld mangler til lager.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-10T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-10T12:00:00.000Z"),
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const containerTask = await createTask(
      {
        created_by: henrik.user_id,
        title: "Ryd op i container",
        description:
          "Sorter materialer, smid affald ud og gør klar til næste levering.",
        priority: TaskPriority.LOW,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-12T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-11T12:00:00.000Z"),
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    // New tasks (more “living app”)
    const gravelTask = await createTask(
      {
        created_by: henrik.user_id,
        title: "Fordel stabilgrus 2.5 km (mål)",
        description:
          "Fordel stabilgrus på strækning. Registrer fremskridt i kilometer.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-18T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-12T08:00:00.000Z"),
        goal_type: TaskGoalType.FIXED,
        unit: TaskUnit.KILOMETERS,
        target_quantity: 2.5,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const pumpTask = await createTask(
      {
        created_by: henrik.user_id,
        title: "Tøm pumpebrønd (mål: 1200L)",
        description: "Tøm pumpebrønd og registrer liter løbende.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-16T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-12T10:00:00.000Z"),
        goal_type: TaskGoalType.FIXED,
        unit: TaskUnit.LITERS,
        target_quantity: 1200,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    // Parent task with subtasks
    const foundationParent = await createTask(
      {
        created_by: henrik.user_id,
        title: "Støb fundament (pakke)",
        description:
          "Samlet opgave: forskalling, armering, støbning og oprydning.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-22T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-13T07:00:00.000Z"),
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
      henrik.user_id,
    );

    const subForskalling = await createSubtask({
      parentTaskId: foundationParent.task_id,
      actorId: henrik.user_id,
      data: {
        created_by: henrik.user_id,
        title: "Forskalling",
        description: "Opsæt forskalling til fundament.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-14T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-13T07:30:00.000Z"),
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
    });

    const subArmering = await createSubtask({
      parentTaskId: foundationParent.task_id,
      actorId: henrik.user_id,
      data: {
        created_by: henrik.user_id,
        title: "Armering",
        description: "Læg armeringsjern og bind korrekt.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-15T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-13T11:00:00.000Z"),
        goal_type: TaskGoalType.OPEN,
        unit: TaskUnit.NONE,
        target_quantity: null,
        current_quantity: 0,
      },
    });

    const subStobning = await createSubtask({
      parentTaskId: foundationParent.task_id,
      actorId: henrik.user_id,
      data: {
        created_by: henrik.user_id,
        title: "Støbning (mål: 6 timer)",
        description: "Støb fundament og registrer timer brugt.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-16T23:59:59.000Z"),
        scheduled_date: new Date("2026-02-14T08:00:00.000Z"),
        goal_type: TaskGoalType.FIXED,
        unit: TaskUnit.HOURS,
        target_quantity: 6,
        current_quantity: 0,
      },
    });

    // --------------------------
    // Assignments (include Viktor)
    // --------------------------

    // Pipe task: tommy + christian + sebastian + viktor
    const aPipeTommy = await createAssignment({
      taskId: pipeTask.task_id,
      userId: tommy.user_id,
      actorId: henrik.user_id,
    });
    const aPipeChristian = await createAssignment({
      taskId: pipeTask.task_id,
      userId: christian.user_id,
      actorId: henrik.user_id,
    });
    const aPipeSebastian = await createAssignment({
      taskId: pipeTask.task_id,
      userId: sebastian.user_id,
      actorId: henrik.user_id,
    });
    const aPipeViktor = await createAssignment({
      taskId: pipeTask.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
    });

    // Other tasks
    await createAssignment({
      taskId: reportTask.task_id,
      userId: henrik.user_id,
      actorId: henrik.user_id,
    });

    await createAssignment({
      taskId: equipmentTask.task_id,
      userId: tommy.user_id,
      actorId: henrik.user_id,
    });

    await createAssignment({
      taskId: containerTask.task_id,
      userId: sebastian.user_id,
      actorId: henrik.user_id,
    });

    // Viktor on multiple tasks
    const aGravelViktor = await createAssignment({
      taskId: gravelTask.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
    });

    const aPumpViktor = await createAssignment({
      taskId: pumpTask.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
    });

    await createAssignment({
      taskId: foundationParent.task_id,
      userId: rasmus.user_id,
      actorId: henrik.user_id,
    });

    await createAssignment({
      taskId: subForskalling.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
    });

    await createAssignment({
      taskId: subArmering.task_id,
      userId: tommy.user_id,
      actorId: henrik.user_id,
    });

    const aSubStobningViktor = await createAssignment({
      taskId: subStobning.task_id,
      userId: viktor.user_id,
      actorId: henrik.user_id,
    });

    // --------------------------
    // Progress logs (multiple tasks)
    // --------------------------

    // Pipe task progress (now also includes Viktor)
    const pipeProgress = [
      {
        a: aPipeTommy,
        actor: tommy.user_id,
        qty: 15,
        note: "Startede ved nordenden",
      },
      {
        a: aPipeChristian,
        actor: christian.user_id,
        qty: 25,
        note: "Lagde langs hegn",
      },
      {
        a: aPipeSebastian,
        actor: sebastian.user_id,
        qty: 10,
        note: "Afsluttede ved brønd",
      },
      {
        a: aPipeTommy,
        actor: tommy.user_id,
        qty: 5,
        note: "Kort stræk efter frokost",
      },
      {
        a: aPipeViktor,
        actor: viktor.user_id,
        qty: 20,
        note: "Hjælp ved samlinger",
      },
    ];

    for (const e of pipeProgress) {
      await createProgress({
        assignmentId: e.a.assignment_id,
        actorId: e.actor,
        qty: e.qty,
        note: e.note,
      });
    }

    const pipeTotal = pipeProgress.reduce((s, e) => s + e.qty, 0);
    await tx.task.update({
      where: { task_id: pipeTask.task_id },
      data: { current_quantity: pipeTotal },
    });
    await tx.taskEvent.create({
      data: {
        task_id: pipeTask.task_id,
        actor_id: henrik.user_id,
        type: TaskEventType.TASK_UPDATED,
        message: "Updated current progress",
        after_json: { current_quantity: pipeTotal } as any,
      },
    });

    // Gravel task progress (km)
    const gravelProgress = [
      { qty: 0.6, note: "Første stræk kørt ud" },
      { qty: 0.4, note: "Efterfyld ved svinget" },
      { qty: 0.3, note: "Afretning med maskine" },
    ];

    for (const gp of gravelProgress) {
      await createProgress({
        assignmentId: aGravelViktor.assignment_id,
        actorId: viktor.user_id,
        qty: gp.qty,
        note: gp.note,
      });
    }

    const gravelTotal = gravelProgress.reduce((s, e) => s + e.qty, 0);
    await tx.task.update({
      where: { task_id: gravelTask.task_id },
      data: { current_quantity: gravelTotal },
    });

    // Pump task progress (liters)
    const pumpProgress = [
      { qty: 300, note: "Startede tømning" },
      { qty: 450, note: "Midtvejs - filter renset" },
      { qty: 200, note: "Slam fjernet" },
    ];

    for (const pp of pumpProgress) {
      await createProgress({
        assignmentId: aPumpViktor.assignment_id,
        actorId: viktor.user_id,
        qty: pp.qty,
        note: pp.note,
      });
    }

    const pumpTotal = pumpProgress.reduce((s, e) => s + e.qty, 0);
    await tx.task.update({
      where: { task_id: pumpTask.task_id },
      data: { current_quantity: pumpTotal },
    });

    // Subtask “Støbning” progress (hours)
    const hoursProgress = [
      { qty: 2, note: "Forberedelse + blanding" },
      { qty: 1.5, note: "Støbning start" },
      { qty: 1, note: "Vibrering + retning" },
    ];

    for (const hp of hoursProgress) {
      await createProgress({
        assignmentId: aSubStobningViktor.assignment_id,
        actorId: viktor.user_id,
        qty: hp.qty,
        note: hp.note,
      });
    }

    const hoursTotal = hoursProgress.reduce((s, e) => s + e.qty, 0);
    await tx.task.update({
      where: { task_id: subStobning.task_id },
      data: { current_quantity: hoursTotal },
    });

    // --------------------------
    // Comments + COMMENT_CREATED events
    // --------------------------
    async function createComment(params: {
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

    await createComment({
      taskId: pipeTask.task_id,
      userId: henrik.user_id,
      message: "Husk at tage billeder før/efter ved kritiske samlinger.",
    });

    await createComment({
      taskId: equipmentTask.task_id,
      userId: tommy.user_id,
      message: "Der mangler handsker i størrelse L.",
    });

    await createComment({
      taskId: gravelTask.task_id,
      userId: viktor.user_id,
      message: "Skal vi bestille en ekstra levering stabilgrus i morgen?",
    });

    await createComment({
      taskId: foundationParent.task_id,
      userId: rasmus.user_id,
      message: "Forskalling ser klar ud — mangler kun sidste afstivning.",
    });

    console.log("✅ Seed complete (expanded):");
    console.log(`- Users: 6`);
    console.log(`- Tasks: 4 original + extra + subtasks`);
    console.log(`- Pipe task progress: ${pipeTotal}/100 m`);
    console.log(`- Gravel task progress: ${gravelTotal}/2.5 km`);
    console.log(`- Pump task progress: ${pumpTotal}/1200 L`);
    console.log(`- Subtask (støbning) progress: ${hoursTotal}/6 hours`);
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
