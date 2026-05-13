import { prisma } from "../db/prisma";
import type {
  CreateTaskAssignmentInput,
  UpdateTaskAssignmentInput,
} from "../types/assignment";

import type { TaskAssignment } from "../generated/prisma/client";

export async function getAllAssignments(orgId: string | null): Promise<TaskAssignment[]> {
  return prisma.taskAssignment.findMany({
    where: orgId ? { task: { project: { organization_id: orgId } } } : undefined,
    include: {
      user: {
        select: {
          user_id: true,
          name: true,
          email: true,
          position: true,
        },
      },
      task: {
        select: {
          task_id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          deadline: true,
        },
      },
    },
    orderBy: { assigned_at: "desc" },
  });
}

export async function assignTaskToUser(
  data: CreateTaskAssignmentInput,
): Promise<TaskAssignment> {
  // Check if assignment already exists
  const existing = await prisma.taskAssignment.findFirst({
    where: {
      task_id: data.task_id,
      user_id: data.user_id,
    },
  });

  if (existing) {
    throw new Error("User is already assigned to this task");
  }

  return prisma.taskAssignment.create({
    data,
    include: {
      task: { select: { task_id: true, title: true } },
      user: { select: { user_id: true, name: true, email: true, position: true } },
    },
  });
}

export async function getTaskAssignments(
  taskId: string,
  orgId: string | null,
): Promise<TaskAssignment[]> {
  return prisma.taskAssignment.findMany({
    where: {
      task_id: taskId,
      ...(orgId ? { task: { project: { organization_id: orgId } } } : {}),
    },
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
  });
}

export async function getAssignmentById(
  assignmentId: string,
  orgId: string | null,
): Promise<TaskAssignment | null> {
  return prisma.taskAssignment.findFirst({
    where: {
      assignment_id: assignmentId,
      ...(orgId ? { task: { project: { organization_id: orgId } } } : {}),
    },
    include: {
      user: {
        select: {
          user_id: true,
          name: true,
          email: true,
          position: true,
        },
      },
      task: {
        select: {
          task_id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          deadline: true,
        },
      },
    },
  });
}

export async function getUserAssignments(
  userId: string,
  orgId: string | null,
): Promise<TaskAssignment[]> {
  return prisma.taskAssignment.findMany({
    where: {
      user_id: userId,
      ...(orgId ? { task: { project: { organization_id: orgId } } } : {}),
    },
    include: {
      task: true,
    },
    orderBy: { assigned_at: "desc" },
  });
}

export async function updateAssignment(
  assignmentId: string,
  data: UpdateTaskAssignmentInput,
): Promise<TaskAssignment> {
  return prisma.taskAssignment.update({
    where: { assignment_id: assignmentId },
    data,
    include: {
      user: {
        select: {
          user_id: true,
          name: true,
          email: true,
          position: true,
        },
      },
      task: {
        select: {
          task_id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          deadline: true,
        },
      },
    },
  });
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  await prisma.taskAssignment.delete({
    where: { assignment_id: assignmentId },
  });
}
