/* prisma/seed.ts */
import {
  PrismaClient,
  UserRole,
  TaskPriority,
  TaskStatus,
} from "../../src/generated/prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data (order matters due to FK constraints)
  await prisma.taskComment.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();

  // Password for all seeded users (change if you want)
  const passwordHash = await bcrypt.hash("Password123!", 10);

  // Create users
  const [henrik, tommy, christian, sebastian] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Henrik Andreassen",
        email: "henrik@andreassen.dk",
        password: passwordHash,
        role: UserRole.ADMIN,
        position: "CEO",
      },
    }),
    prisma.user.create({
      data: {
        name: "Tommy Liberkind",
        email: "tommy@andreassen.dk",
        password: passwordHash,
        role: UserRole.USER,
        position: "Håndmand",
      },
    }),
    prisma.user.create({
      data: {
        name: "Christian Larsen",
        email: "christian@andreassen.dk",
        password: passwordHash,
        role: UserRole.USER,
        position: "Maskinfører",
      },
    }),
    prisma.user.create({
      data: {
        name: "Sebastian Bartoldy",
        email: "sebastian@andreassen.dk",
        password: passwordHash,
        role: UserRole.USER,
        position: "Håndmand",
      },
    }),
  ]);

  // Create tasks (created_by must reference user.user_id)
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        created_by: henrik.user_id,
        title: "Forbered ugentlig rapport",
        description:
          "Indsaml data fra alle afdelinger og udarbejd den ugentlige rapport.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-14"),
      },
    }),
    prisma.task.create({
      data: {
        created_by: henrik.user_id,
        title: "Tjek materiel på pladsen",
        description: "Gennemgå værktøj/materiel og meld mangler til lager.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-08"),
      },
    }),
    prisma.task.create({
      data: {
        created_by: henrik.user_id,
        title: "Kør grus til område B",
        description: "Flyt 2 læs grus til område B før frokost.",
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-07"),
      },
    }),
    prisma.task.create({
      data: {
        created_by: henrik.user_id,
        title: "Ryd op i container",
        description:
          "Sorter materialer, smid affald ud og gør klar til næste levering.",
        priority: TaskPriority.LOW,
        status: TaskStatus.PENDING,
        deadline: new Date("2026-02-10"),
      },
    }),
    prisma.task.create({
      data: {
        created_by: henrik.user_id,
        title: "Sikkerhedstjek af maskiner",
        description: "Tjek olie, dæktryk og sikkerhedsudstyr på maskinerne.",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.DONE,
        deadline: new Date("2026-02-03"),
      },
    }),
    prisma.task.create({
      data: {
        created_by: henrik.user_id,
        title: "Planlæg bemanding til næste uge",
        description: "Fordel opgaver og bemanding for næste uge.",
        priority: TaskPriority.LOW,
        status: TaskStatus.REJECTED,
        deadline: new Date("2026-02-05"),
      },
    }),
  ]);

  // Assign tasks
  await prisma.taskAssignment.createMany({
    data: [
      { task_id: tasks[0].task_id, user_id: henrik.user_id }, // report -> Henrik
      { task_id: tasks[1].task_id, user_id: tommy.user_id }, // equipment -> Tommy
      { task_id: tasks[2].task_id, user_id: christian.user_id }, // gravel -> Christian
      { task_id: tasks[3].task_id, user_id: sebastian.user_id }, // container -> Sebastian
      { task_id: tasks[4].task_id, user_id: christian.user_id }, // safety -> Christian
      { task_id: tasks[4].task_id, user_id: tommy.user_id }, // safety -> Tommy (2 assignees)
      { task_id: tasks[5].task_id, user_id: henrik.user_id }, // staffing -> Henrik
    ],
  });

  // Add comments
  await prisma.taskComment.createMany({
    data: [
      {
        task_id: tasks[2].task_id,
        user_id: christian.user_id,
        message: "Jeg tager den efter morgenmødet.",
      },
      {
        task_id: tasks[2].task_id,
        user_id: henrik.user_id,
        message: "Husk at tjekke adgangsvej til område B først.",
      },
      {
        task_id: tasks[1].task_id,
        user_id: tommy.user_id,
        message: "Der mangler handsker i størrelse L.",
      },
      {
        task_id: tasks[3].task_id,
        user_id: sebastian.user_id,
        message: "Kan jeg få en ekstra sæk affaldsposer?",
      },
    ],
  });

  console.log("✅ Seed complete:");
  console.log(`- Users: 4`);
  console.log(`- Tasks: ${tasks.length}`);
  console.log(`- Assignments: 7`);
  console.log(`- Comments: 4`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
