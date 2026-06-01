import { prisma } from "../db/prisma";
import { TaskEventType, TaskStatus } from "../generated/prisma/client";
import * as assignmentRepo from "../repositories/assignmentRepository";
import * as taskRepo from "../repositories/taskRepository";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as userRepo from "../repositories/userRepository";
import { sendPushNotification } from "./notificationService";
import type { RequestContext } from "../types/requestContext";
import {
  AssignmentNotFoundError,
  AssignmentCrossOrganizationError,
  TaskArchivedError,
} from "../errors/domainErrors";

export { AssignmentNotFoundError, AssignmentCrossOrganizationError };

// Lists all assignments scoped to the caller's org (or platform-wide for super-admin).
export async function listAssignments(ctx: RequestContext, userId?: string, taskId?: string) {
  if (userId) return assignmentRepo.getUserAssignments(userId, ctx.effectiveOrgId);
  if (taskId) return assignmentRepo.getTaskAssignments(taskId, ctx.effectiveOrgId);
  return assignmentRepo.getAllAssignments(ctx.effectiveOrgId);
}

export async function getTaskAssignments(ctx: RequestContext, taskId: string) {
  return assignmentRepo.getTaskAssignments(taskId, ctx.effectiveOrgId);
}

export async function getUserAssignments(ctx: RequestContext, userId: string) {
  return assignmentRepo.getUserAssignments(userId, ctx.effectiveOrgId);
}

export async function getAssignmentById(ctx: RequestContext, assignmentId: string) {
  return assignmentRepo.getAssignmentById(assignmentId, ctx.effectiveOrgId);
}

// Assignments cannot be created on archived tasks.
// The assigned user must belong to the same organization as the task.
export async function assignTaskToUser(
  ctx: RequestContext,
  taskId: string,
  userId: string,
) {
  const task = await taskRepo.getTaskById(taskId, ctx.effectiveOrgId);
  if (!task) return null;

  if (task.status === TaskStatus.ARCHIVED) throw new TaskArchivedError();

  const assignment = await assignmentRepo.assignTaskToUser(
    { task_id: taskId, user_id: userId },
    ctx.effectiveOrgId,
  );

  await taskEventRepo.createTaskEvent(prisma, {
    task: { connect: { task_id: assignment.task_id } },
    actor: { connect: { user_id: ctx.actorUserId } },
    type: TaskEventType.ASSIGNMENT_CREATED,
    message: "Assignment created",
    assignment: { connect: { assignment_id: assignment.assignment_id } },
    before_json: {},
    after_json: assignment,
  });

  // Notify the assigned user after the event is recorded.
  const pushToken = await userRepo.getPushToken(userId);
  if (pushToken) {
    const taskTitle = (assignment as any).task?.title ?? "En opgave";
    void sendPushNotification(
      pushToken,
      "Ny opgave tildelt",
      `Du er blevet tildelt: ${taskTitle}`,
      { taskId: assignment.task_id },
      userId,
    );
  }

  return assignment;
}

// Deleting an assignment on an archived task is rejected.
export async function deleteAssignment(ctx: RequestContext, assignmentId: string) {
  const existing = await assignmentRepo.getAssignmentById(assignmentId, ctx.effectiveOrgId);
  if (!existing) throw new AssignmentNotFoundError();

  if ((existing as any).task?.status === TaskStatus.ARCHIVED) throw new TaskArchivedError();

  // Log event before deletion so the assignment FK still exists.
  await taskEventRepo.createTaskEvent(prisma, {
    task: { connect: { task_id: existing.task_id } },
    actor: { connect: { user_id: ctx.actorUserId } },
    type: TaskEventType.ASSIGNMENT_DELETED,
    message: "Assignment deleted",
    assignment: { connect: { assignment_id: existing.assignment_id } },
    before_json: existing,
    after_json: {},
  });

  await assignmentRepo.deleteAssignment(assignmentId, ctx.effectiveOrgId);

  return true;
}
