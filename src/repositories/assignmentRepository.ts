import { prisma } from "../db/prisma";
import type {
  CreateTaskAssignmentInput,
  UpdateTaskAssignmentInput,
} from "../types/assignment";

import type { TaskAssignment } from "../generated/prisma/client";

export class AssignmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Assignment not found: ${id}`);
    this.name = "AssignmentNotFoundError";
  }
}

export class AssignmentCrossOrganizationError extends Error {
  constructor(message = "Task and user must belong to the same organization.") {
    super(message);
    this.name = "AssignmentCrossOrganizationError";
  }
}

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
  effectiveOrgId: string | null,
): Promise<TaskAssignment> {
  const task = await prisma.task.findFirst({
    where: {
      task_id: data.task_id,
      ...(effectiveOrgId ? { project: { organization_id: effectiveOrgId } } : {}),
    },
    select: { project: { select: { organization_id: true } } },
  });
  if (!task) throw new AssignmentCrossOrganizationError("Task not found in organization.");

  const user = await prisma.user.findFirst({
    where: {
      user_id: data.user_id,
      organization_id: task.project.organization_id,
    },
    select: { user_id: true },
  });
  if (!user) {
    throw new AssignmentCrossOrganizationError("Assigned user must belong to the task organization.");
  }

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
  effectiveOrgId: string | null,
): Promise<TaskAssignment> {
  const existing = await prisma.taskAssignment.findFirst({
    where: {
      assignment_id: assignmentId,
      ...(effectiveOrgId ? { task: { project: { organization_id: effectiveOrgId } } } : {}),
    },
    select: { assignment_id: true },
  });
  if (!existing) throw new AssignmentNotFoundError(assignmentId);

  return prisma.taskAssignment.update({
    where: { assignment_id: existing.assignment_id },
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

export async function deleteAssignment(
  assignmentId: string,
  effectiveOrgId: string | null,
): Promise<void> {
  const result = await prisma.taskAssignment.deleteMany({
    where: {
      assignment_id: assignmentId,
      ...(effectiveOrgId ? { task: { project: { organization_id: effectiveOrgId } } } : {}),
    },
  });
  if (result.count === 0) throw new AssignmentNotFoundError(assignmentId);
}
