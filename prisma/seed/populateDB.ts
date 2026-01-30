import {
  PrismaClient,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "../../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // Clear existing data
  console.log("🧹 Cleaning existing data...");
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  console.log("👥 Creating users...");
  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@example.com",
      password: "$2a$10$YourHashedPasswordHere", // In production, use bcrypt
      role: UserRole.ADMIN,
      position: "System Administrator",
    },
  });

  const developer1 = await prisma.user.create({
    data: {
      name: "John Doe",
      email: "john.doe@example.com",
      password: "$2a$10$YourHashedPasswordHere",
      role: UserRole.USER,
      position: "Senior Developer",
    },
  });

  const developer2 = await prisma.user.create({
    data: {
      name: "Jane Smith",
      email: "jane.smith@example.com",
      password: "$2a$10$YourHashedPasswordHere",
      role: UserRole.USER,
      position: "Frontend Developer",
    },
  });

  const designer = await prisma.user.create({
    data: {
      name: "Alice Johnson",
      email: "alice.johnson@example.com",
      password: "$2a$10$YourHashedPasswordHere",
      role: UserRole.USER,
      position: "UI/UX Designer",
    },
  });

  console.log(`✅ Created ${4} users`);

  // Create tasks
  console.log("📋 Creating tasks...");
  const task1 = await prisma.task.create({
    data: {
      title: "Implement authentication system",
      description: "Add JWT-based authentication with login and registration",
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      deadline: new Date("2026-02-15"),
      created_by: admin.user_id,
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: "Design landing page",
      description: "Create modern and responsive landing page design",
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      deadline: new Date("2026-02-10"),
      created_by: admin.user_id,
    },
  });

  const task3 = await prisma.task.create({
    data: {
      title: "Fix database migration issues",
      description: "Resolve conflicts in Prisma schema migrations",
      priority: TaskPriority.HIGH,
      status: TaskStatus.DONE,
      deadline: new Date("2026-01-25"),
      created_by: developer1.user_id,
    },
  });

  const task4 = await prisma.task.create({
    data: {
      title: "Write API documentation",
      description: "Document all REST API endpoints with examples",
      priority: TaskPriority.LOW,
      status: TaskStatus.PENDING,
      deadline: new Date("2026-03-01"),
      created_by: admin.user_id,
    },
  });

  const task5 = await prisma.task.create({
    data: {
      title: "Optimize database queries",
      description: "Improve performance of slow queries in user dashboard",
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.REJECTED,
      deadline: new Date("2026-02-20"),
      created_by: developer1.user_id,
    },
  });

  const task6 = await prisma.task.create({
    data: {
      title: "Setup CI/CD pipeline",
      description:
        "Configure GitHub Actions for automated testing and deployment",
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      deadline: new Date("2026-02-05"),
      created_by: admin.user_id,
    },
  });

  console.log(`✅ Created ${6} tasks`);

  // Create task assignments
  console.log("🔗 Creating task assignments...");
  await prisma.taskAssignment.createMany({
    data: [
      {
        task_id: task1.task_id,
        user_id: developer1.user_id,
      },
      {
        task_id: task2.task_id,
        user_id: designer.user_id,
      },
      {
        task_id: task3.task_id,
        user_id: developer1.user_id,
        completed_at: new Date("2026-01-24"),
      },
      {
        task_id: task4.task_id,
        user_id: developer2.user_id,
      },
      {
        task_id: task5.task_id,
        user_id: developer1.user_id,
      },
      {
        task_id: task6.task_id,
        user_id: developer1.user_id,
      },
      {
        task_id: task6.task_id,
        user_id: developer2.user_id,
      },
    ],
  });

  console.log(`✅ Created ${7} task assignments`);
  console.log("🎉 Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
