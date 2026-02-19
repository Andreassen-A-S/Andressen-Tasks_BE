import { prisma } from "../db/prisma";
import {
  type Task,
  TaskGoalType,
  TaskStatus,
  TaskUnit,
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
        unit: data.unit ?? TaskUnit.NONE,
        goal_type: data.goal_type ?? TaskGoalType.OPEN,
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
    const existingTask = await tx.task.findUnique({
      where: { task_id: id },
      select: {
        status: true,
        completed_by: true,
        completed_at: true,
      },
    });
    if (!existingTask) throw new Error("Task not found");

    const { assigned_users, ...taskUpdateData } = data;
    const finalStatus = data.status ?? existingTask.status;
    const isAlreadyDone = existingTask.status === TaskStatus.DONE;
    const completionTimestamp =
      isAlreadyDone && existingTask.completed_at
        ? existingTask.completed_at
        : new Date();

    const updateData: Record<string, unknown> = { ...taskUpdateData };

    if (data.status === undefined) {
    } else if (data.status === TaskStatus.DONE) {
      if (isAlreadyDone) {
        updateData.completed_by = existingTask.completed_by;
        updateData.completed_at = existingTask.completed_at;
      } else if (userId) {
        updateData.completed_by = userId;
        updateData.completed_at = completionTimestamp;
      }
    } else {
      updateData.completed_by = null;
      updateData.completed_at = null;
    }

    await tx.task.update({
      where: { task_id: id },
      data: updateData,
    });

    if (assigned_users !== undefined) {
      await tx.taskAssignment.deleteMany({
        where: { task_id: id },
      });

      if (assigned_users.length > 0) {
        const completedAt =
          finalStatus === TaskStatus.DONE ? completionTimestamp : null;

        await tx.taskAssignment.createMany({
          data: assigned_users.map((assigneeId) => ({
            task_id: id,
            user_id: assigneeId,
            completed_at: completedAt,
          })),
        });
      }
    } else if (data.status === TaskStatus.DONE) {
      await tx.taskAssignment.updateMany({
        where: isAlreadyDone
          ? { task_id: id, completed_at: null }
          : { task_id: id },
        data: { completed_at: completionTimestamp },
      });
    } else if (data.status !== undefined) {
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: null },
      });
    }

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
  return prisma.$transaction(async (tx) => {
    const existingTask = await tx.task.findUnique({
      where: { task_id: id },
      select: {
        status: true,
        completed_by: true,
        completed_at: true,
      },
    });
    if (!existingTask) throw new Error("Task not found");

    const isAlreadyDone = existingTask.status === TaskStatus.DONE;
    const completionTimestamp =
      isAlreadyDone && existingTask.completed_at
        ? existingTask.completed_at
        : new Date();

    const task = await tx.task.update({
      where: { task_id: id },
      data: {
        ...data,
        ...(data.status === undefined
          ? {}
          : data.status === TaskStatus.DONE
            ? isAlreadyDone
              ? {
                  completed_by: existingTask.completed_by,
                  completed_at: existingTask.completed_at,
                }
              : userId
                ? { completed_by: userId, completed_at: completionTimestamp }
                : {}
            : { completed_by: null, completed_at: null }),
      },
    });

    if (data.status === TaskStatus.DONE) {
      await tx.taskAssignment.updateMany({
        where: isAlreadyDone
          ? { task_id: id, completed_at: null }
          : { task_id: id },
        data: { completed_at: completionTimestamp },
      });
    } else if (data.status !== undefined) {
      await tx.taskAssignment.updateMany({
        where: { task_id: id },
        data: { completed_at: null },
      });
    }

    return task;
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
    const task = await tx.task.findUnique({
      where: { task_id: taskId },
    });

    if (!task) throw new Error("Task not found");

    if (task.status === TaskStatus.ARCHIVED) {
      throw new Error("Cannot log progress on archived tasks");
    }

    if (task.status === TaskStatus.REJECTED) {
      throw new Error("Cannot log progress on rejected tasks");
    }

    if (task.status === TaskStatus.DONE) {
      throw new Error(
        "Cannot log progress on completed tasks. Change status first.",
      );
    }

    const assignment = await tx.taskAssignment.findUnique({
      where: {
        task_id_user_id: {
          task_id: taskId,
          user_id: userId,
        },
      },
    });

    if (!assignment) throw new Error("Assignment not found");

    const progressLog = await tx.taskProgressLog.create({
      data: {
        assignment_id: assignment.assignment_id,
        quantity_done,
        unit,
        note,
      },
    });

    const newCurrentQuantity = (task.current_quantity || 0) + quantity_done;

    let newStatus: TaskStatus = task.status;

    if (quantity_done > 0 && task.status === TaskStatus.PENDING) {
      newStatus = TaskStatus.IN_PROGRESS;
    }

    if (
      task.goal_type === TaskGoalType.FIXED &&
      task.target_quantity &&
      newCurrentQuantity >= task.target_quantity
    ) {
      newStatus = TaskStatus.DONE;
    }

    const completionTimestamp = new Date();

    const updatedTask = await tx.task.update({
      where: { task_id: taskId },
      data: {
        current_quantity: newCurrentQuantity,
        status: newStatus,
        updated_at: new Date(),
        ...(newStatus === TaskStatus.DONE
          ? { completed_by: userId, completed_at: completionTimestamp }
          : {}),
      },
    });

    if (newStatus === TaskStatus.DONE) {
      await tx.taskAssignment.updateMany({
        where: { task_id: taskId },
        data: { completed_at: completionTimestamp },
      });
    }

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
