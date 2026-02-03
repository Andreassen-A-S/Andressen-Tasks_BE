import { prisma } from "../db/prisma";
import type {
  // TaskAssignment,
  CreateTaskAssignmentInput,
  UpdateTaskAssignmentInput,
} from "../types/assignment";

import type { TaskAssignment } from "../generated/prisma/client";

export async function getAllAssignments(): Promise<TaskAssignment[]> {
  return prisma.taskAssignment.findMany({
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
  });
}

export async function getTaskAssignments(
  taskId: string,
): Promise<TaskAssignment[]> {
  return prisma.taskAssignment.findMany({
    where: { task_id: taskId },
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
): Promise<TaskAssignment | null> {
  return prisma.taskAssignment.findUnique({
    where: { assignment_id: assignmentId },
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
): Promise<TaskAssignment[]> {
  return prisma.taskAssignment.findMany({
    where: { user_id: userId },
    include: {
      task: true,
    },
    orderBy: { assigned_at: "desc" },
  });
}

// export async function markAssignmentComplete(
//   assignmentId: string,
// ): Promise<TaskAssignment> {
//   return prisma.taskAssignment.update({
//     where: { assignment_id: assignmentId },
//     data: { completed_at: new Date() },
//   });
// }

// export async function unassignUserFromTask(
//   taskId: string,
//   userId: string,
// ): Promise<void> {
//   await prisma.taskAssignment.deleteMany({
//     where: {
//       task_id: taskId,
//       user_id: userId,
//     },
//   });
// }

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
