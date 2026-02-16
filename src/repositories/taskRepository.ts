import { prisma } from "../db/prisma";
import {
  type Task,
  type Prisma,
  type TaskUnit,
  TaskGoalType,
  TaskStatus,
} from "../generated/prisma/client";
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
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const { assigned_users, ...taskUpdateData } = data;

    const updateData: Record<string, unknown> = { ...taskUpdateData };
    if (data.status === TaskStatus.DONE && userId) {
      updateData.completed_by = userId;
    } else if (data.status === TaskStatus.PENDING) {
      updateData.completed_by = null;
    }

    const task = await tx.task.update({
      where: { task_id: id },
      data: updateData,
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
  userId?: string,
): Promise<Task> {
  return prisma.task.update({
    where: { task_id: id },
    data: {
      ...data,
      ...(data.status === TaskStatus.DONE && userId
        ? { completed_by: userId }
        : data.status === TaskStatus.PENDING
          ? { completed_by: null }
          : {}),
    },
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
  unit?: TaskUnit,
  note?: string,
) {
  return await prisma.$transaction(async (tx) => {
    // Get the task to check current state
    const task = await tx.task.findUnique({
      where: { task_id: taskId },
    });

    if (!task) throw new Error("Task not found");

    // Find assignment
    const assignment = await tx.taskAssignment.findUnique({
      where: {
        task_id_user_id: {
          task_id: taskId,
          user_id: userId,
        },
      },
    });

    if (!assignment) throw new Error("Assignment not found");

    // Create progress log
    const progressLog = await tx.taskProgressLog.create({
      data: {
        assignment_id: assignment.assignment_id,
        quantity_done,
        unit,
        note,
      },
    });

    // Calculate new current_quantity
    const newCurrentQuantity = (task.current_quantity || 0) + quantity_done;

    // Determine new status
    let newStatus = task.status;
    if (quantity_done > 0 && task.status === TaskStatus.PENDING) {
      newStatus = TaskStatus.IN_PROGRESS;
    }

    // Check if task is complete
    if (
      task.goal_type === TaskGoalType.FIXED &&
      task.target_quantity &&
      newCurrentQuantity >= task.target_quantity
    ) {
      newStatus = TaskStatus.DONE;
    }

    // Update task
    const updatedTask = await tx.task.update({
      where: { task_id: taskId },
      data: {
        current_quantity: newCurrentQuantity,
        status: newStatus,
        updated_at: new Date(),
        ...(newStatus === TaskStatus.DONE ? { completed_by: userId } : {}),
      },
    });

    return { progressLog, updatedTask };
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
