import { prisma } from "../db/prisma";
import type { Task, Prisma } from "../generated/prisma/client";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";

export async function getAllTasks(): Promise<Task[]> {
  return prisma.task.findMany({
    orderBy: { created_at: "desc" },
  });
}

export async function getTaskById(id: string): Promise<Task | null> {
  return prisma.task.findUnique({
    where: { task_id: id },
  });
}

export async function createTask(data: CreateTaskInput) {
  return prisma.task.create({
    data,
  });
}

export async function createTaskWithAssignments(data: CreateTaskInput) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline,
        created_by: data.created_by,
        parent_task_id: data.parent_task_id ?? null,
        scheduled_date: data.scheduled_date,
        unit: data.unit ?? "NONE",
        goal_type: data.goal_type ?? "OPEN",
        target_quantity: data.target_quantity ?? null,
        current_quantity: data.current_quantity ?? 0,
      },
    });

    if (data.assigned_users && data.assigned_users.length > 0) {
      await tx.taskAssignment.createMany({
        data: data.assigned_users.map((userId) => ({
          task_id: task.task_id,
          user_id: userId,
        })),
      });
    }

    // The return type is inferred automatically from this query
    return tx.task.findUnique({
      where: { task_id: task.task_id },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                user_id: true,
                name: true,
                email: true,
                position: true,
              },
            },
          },
        },
      },
    });
  });
}

export async function updateTaskWithAssignments(
  id: string,
  data: UpdateTaskInput,
) {
  return prisma.$transaction(async (tx) => {
    const { assigned_users, ...taskUpdateData } = data;

    const task = await tx.task.update({
      where: { task_id: id },
      data: taskUpdateData,
    });

    if (data.status === "DONE") {
      await tx.taskAssignment.updateMany({
        where: {
          task_id: id,
          completed_at: null,
        },
        data: {
          completed_at: new Date(),
        },
      });
    } else if (data.status === "PENDING" || data.status === "REJECTED") {
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: {
          completed_at: null,
        },
      });
    }

    if (assigned_users !== undefined) {
      await tx.taskAssignment.deleteMany({
        where: { task_id: id },
      });

      if (assigned_users.length > 0) {
        const completedAt = data.status === "DONE" ? new Date() : null;

        await tx.taskAssignment.createMany({
          data: assigned_users.map((userId) => ({
            task_id: id,
            user_id: userId,
            completed_at: completedAt,
          })),
        });
      }
    }

    // The return type is inferred automatically from this query
    return tx.task.findUnique({
      where: { task_id: id },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                user_id: true,
                name: true,
                email: true,
                position: true,
              },
            },
          },
        },
        creator: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  });
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
): Promise<Task> {
  return prisma.task.update({
    where: { task_id: id },
    data,
  });
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({
    where: { task_id: id },
  });
}

export async function upsertProgressLog(
  taskId: string,
  userId: string,
  quantity_done: number,
  note?: string,
) {
  const assignment = await prisma.taskAssignment.findUnique({
    where: {
      task_id_user_id: {
        task_id: taskId,
        user_id: userId,
      },
    },
  });
  if (!assignment) throw new Error("Assignment not found");

  return prisma.taskProgressLog.create({
    data: { assignment_id: assignment.assignment_id, quantity_done, note },
  });
}

export async function getTaskByIdWithAssignments(id: string) {
  return prisma.task.findUnique({
    where: { task_id: id },
    include: {
      assignments: {
        include: {
          user: {
            select: { user_id: true, name: true, email: true, position: true },
          },
        },
      },
    },
  });
}
