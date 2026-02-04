import { prisma } from "../db/prisma";
import type { Task } from "../generated/prisma/client";
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
    // Create the task
    const task = await tx.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline,
        created_by: data.created_by,
      },
    });

    // Create assignments if users are provided
    if (data.assigned_users && data.assigned_users.length > 0) {
      await tx.taskAssignment.createMany({
        data: data.assigned_users.map((userId) => ({
          task_id: task.task_id,
          user_id: userId,
        })),
      });
    }

    // Return task with assignments
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
): Promise<Task | null> {
  return prisma.$transaction(async (tx) => {
    // Separate assignment-related data from task fields
    const { assigned_users, ...taskUpdateData } = data;
    // Update the task
    const task = await tx.task.update({
      where: { task_id: id },
      data: taskUpdateData,
    });

    // Handle completion status change
    if (data.status === "DONE") {
      // Mark all assignments as completed
      await tx.taskAssignment.updateMany({
        where: {
          task_id: id,
          completed_at: null, // Only update assignments that aren't already completed
        },
        data: {
          completed_at: new Date(),
        },
      });
    } else if (data.status === "PENDING" || data.status === "REJECTED") {
      // If status changed back to PENDING or REJECTED, clear completion timestamps
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: {
          completed_at: null,
        },
      });
    }

    // Handle assignment updates if provided
    if (data.assigned_users !== undefined) {
      // Remove all existing assignments
      await tx.taskAssignment.deleteMany({
        where: { task_id: id },
      });

      // Create new assignments if users are provided
      if (data.assigned_users.length > 0) {
        const completedAt = data.status === "DONE" ? new Date() : null;

        await tx.taskAssignment.createMany({
          data: data.assigned_users.map((userId) => ({
            task_id: id,
            user_id: userId,
            completed_at: completedAt,
          })),
        });
      }
    }

    // Return task with updated assignments
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
