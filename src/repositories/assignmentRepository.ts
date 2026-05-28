import { prisma } from "../db/prisma";
import type {
  CreateTaskAssignmentInput,
  UpdateTaskAssignmentInput,
} from "../types/assignment";

import type { TaskAssignment } from "../generated/prisma/client";
import { AssignmentNotFoundError, AssignmentCrossOrganizationError, DuplicateAssignmentError } from "../errors/domainErrors";
import type { DbClient } from "../types/db";
import { userSelect } from "../types/user";
import { signUserProfilePicture } from "./userRepository";

async function signAssignmentUser<T extends { user?: any }>(a: T): Promise<T> {
  if (!a.user) return a;
  return { ...a, user: await signUserProfilePicture(a.user) };
}

// Re-export for backward compatibility with imports from this module.
export { AssignmentNotFoundError, AssignmentCrossOrganizationError } from "../errors/domainErrors";

export async function getAllAssignments(orgId: string | null): Promise<TaskAssignment[]> {
  const assignments = await prisma.taskAssignment.findMany({
    where: orgId ? { task: { project: { organization_id: orgId } } } : undefined,
    include: {
      user: { select: userSelect },
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
  return Promise.all(assignments.map(signAssignmentUser));
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
    throw new DuplicateAssignmentError();
  }

  const assignment = await prisma.taskAssignment.create({
    data,
    include: {
      task: { select: { task_id: true, title: true } },
      user: { select: userSelect },
    },
  });
  return signAssignmentUser(assignment);
}

export async function getTaskAssignments(
  taskId: string,
  orgId: string | null,
): Promise<TaskAssignment[]> {
  const assignments = await prisma.taskAssignment.findMany({
    where: {
      task_id: taskId,
      ...(orgId ? { task: { project: { organization_id: orgId } } } : {}),
    },
    include: {
      user: { select: userSelect },
    },
  });
  return Promise.all(assignments.map(signAssignmentUser));
}

export async function getAssignmentById(
  assignmentId: string,
  orgId: string | null,
): Promise<TaskAssignment | null> {
  const assignment = await prisma.taskAssignment.findFirst({
    where: {
      assignment_id: assignmentId,
      ...(orgId ? { task: { project: { organization_id: orgId } } } : {}),
    },
    include: {
      user: { select: userSelect },
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
  if (!assignment) return null;
  return signAssignmentUser(assignment);
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
  db: DbClient,
  assignmentId: string,
  data: UpdateTaskAssignmentInput,
  effectiveOrgId: string | null,
): Promise<TaskAssignment> {
  const existing = await (db as any).taskAssignment.findFirst({
    where: {
      assignment_id: assignmentId,
      ...(effectiveOrgId ? { task: { project: { organization_id: effectiveOrgId } } } : {}),
    },
    select: { assignment_id: true },
  });
  if (!existing) throw new AssignmentNotFoundError(assignmentId);

  const assignment = await (db as any).taskAssignment.update({
    where: { assignment_id: existing.assignment_id },
    data,
    include: {
      user: { select: userSelect },
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
  return signAssignmentUser(assignment);
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
