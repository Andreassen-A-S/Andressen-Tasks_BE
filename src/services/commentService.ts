import { prisma } from "../db/prisma";
import { TaskEventType, TaskStatus, UserRole } from "../generated/prisma/client";
import * as commentRepo from "../repositories/commentRepository";
import * as attachmentRepo from "../repositories/attachmentRepository";
import * as taskRepo from "../repositories/taskRepository";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as userRepo from "../repositories/userRepository";
import { sendPushNotification } from "./notificationService";
import { generateSignedReadUrl, deleteFile } from "./storageService";
import type { RequestContext } from "../types/requestContext";
import {
  CommentNotFoundError,
  CommentForbiddenError,
  TaskArchivedError,
} from "../errors/domainErrors";

export { CommentNotFoundError, CommentForbiddenError };

// Any authenticated user who can see the task (creator, assigned, admin, super-admin)
// can view and post comments. Modification/deletion is limited to the comment author
// and admins/super-admins.
function canAccessTask(
  task: { created_by: string; assignments?: { user_id: string }[] } | null,
  ctx: RequestContext,
): boolean {
  if (!task) return false;
  if (ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN) return true;
  if (task.created_by === ctx.actorUserId) return true;
  return (task.assignments ?? []).some((a) => a.user_id === ctx.actorUserId);
}

// Only the comment author can edit their own comment.
// Admins and super-admins are intentionally excluded from editing others' comments —
// they can delete but not alter another user's words.
function canModifyComment(comment: { user_id: string }, ctx: RequestContext): boolean {
  return comment.user_id === ctx.actorUserId;
}

export async function getCommentsByTaskId(ctx: RequestContext, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      task_id: taskId,
      ...(ctx.effectiveOrgId ? { project: { organization_id: ctx.effectiveOrgId } } : {}),
    },
    include: { assignments: { where: { user_id: ctx.actorUserId } } },
  });

  if (!task || !canAccessTask(task, ctx)) return null;

  const comments = await commentRepo.getCommentsByTaskId(taskId);
  return Promise.all(
    comments.map(async (comment) => ({
      ...comment,
      attachments: await Promise.all(
        comment.attachments.map(async (att: any) => ({
          ...att,
          url: await generateSignedReadUrl(att.gcs_path),
        })),
      ),
    })),
  );
}

export async function createComment(
  ctx: RequestContext,
  taskId: string,
  message: string | undefined,
  uploadTokens: string[] | undefined,
  replyToCommentId?: string,
) {
  // Fetch task with all assignments for notification routing.
  const task = await prisma.task.findFirst({
    where: {
      task_id: taskId,
      ...(ctx.effectiveOrgId ? { project: { organization_id: ctx.effectiveOrgId } } : {}),
    },
    include: {
      assignments: {
        include: { user: { select: { user_id: true, role: true, push_token: true } } },
      },
    },
  });

  if (!task) return null;

  // canAccessTask needs assignments array
  if (!canAccessTask(task, ctx)) return null;

  if (task.status === TaskStatus.ARCHIVED) {
    throw new TaskArchivedError();
  }

  const replyTarget = replyToCommentId
    ? await commentRepo.getCommentById(replyToCommentId)
    : null;
  if (replyToCommentId && (!replyTarget || replyTarget.task_id !== taskId)) {
    throw new CommentNotFoundError();
  }

  const replyPreview = replyTarget
    ? (replyTarget.message.trim() || (replyTarget.attachments.length > 0 ? "Vedhæftning" : "Kommentar")).slice(0, 180)
    : undefined;
  const replyAuthorName = replyTarget
    ? (replyTarget.author?.name?.trim() || replyTarget.author?.email || "Ukendt bruger")
    : undefined;

  const comment = await prisma.$transaction(async (tx) => {
    const created = await commentRepo.createComment(tx, {
      message: message?.trim() ?? "",
      task_id: taskId,
      user_id: ctx.actorUserId,
      upload_tokens: uploadTokens,
      reply_to_comment_id: replyTarget?.comment_id,
      reply_preview: replyPreview,
      reply_author_id: replyTarget?.user_id,
      reply_author_name: replyAuthorName,
    });

    await taskEventRepo.createTaskEvent(tx, {
      task: { connect: { task_id: created.task_id } },
      actor: { connect: { user_id: ctx.actorUserId } },
      type: TaskEventType.COMMENT_CREATED,
      message: "Comment created",
      comment: { connect: { comment_id: created.comment_id } },
      before_json: {},
      after_json: created,
    });

    return created;
  });

  const notifiedUserIds = new Set<string>();

  const replyTargetHasAccess = replyTarget && (
    replyTarget.user_id === task.created_by ||
    task.assignments.some((a) => a.user_id === replyTarget.user_id)
  );

  if (replyTargetHasAccess && replyTarget.user_id !== ctx.actorUserId) {
    const replyPushToken = await userRepo.getPushToken(replyTarget.user_id);
    if (replyPushToken) {
      notifiedUserIds.add(replyTarget.user_id);
      void sendPushNotification(
        replyPushToken,
        "Nyt svar på din kommentar",
        task.title,
        { taskId: task.task_id, screen: "comments", commentId: comment.comment_id },
        replyTarget.user_id,
      );
    }
  }

  // Notify assigned users (skip commenter, skip admins — they get a separate notification).
  for (const assignment of task.assignments) {
    if (assignment.user_id === ctx.actorUserId) continue;
    if (notifiedUserIds.has(assignment.user_id)) continue;
    if (assignment.user.role === UserRole.ADMIN) continue;
    if (!assignment.user.push_token) continue;
    notifiedUserIds.add(assignment.user_id);
    void sendPushNotification(
      assignment.user.push_token,
      "Ny kommentar på din opgave",
      task.title,
      { taskId: task.task_id, screen: "comments" },
      assignment.user_id,
    );
  }

  // Notify admins separately.
  const admins = await userRepo.getAdminPushTokens(ctx.effectiveOrgId);
  for (const { user_id: adminId, push_token } of admins) {
    if (adminId === ctx.actorUserId) continue;
    if (notifiedUserIds.has(adminId)) continue;
    notifiedUserIds.add(adminId);
    void sendPushNotification(
      push_token,
      "Ny kommentar",
      task.title,
      { taskId: task.task_id, screen: "comments" },
      adminId,
    );
  }

  return comment;
}

export async function updateComment(
  ctx: RequestContext,
  commentId: string,
  message: string | undefined,
  uploadTokens?: string[],
  removeAttachmentIds?: string[],
) {
  const comment = await commentRepo.getCommentById(commentId);
  if (!comment) throw new CommentNotFoundError();

  // Verify the task is within org scope, caller can access it, and it is not archived.
  const commentTask = await prisma.task.findFirst({
    where: {
      task_id: comment.task_id,
      ...(ctx.effectiveOrgId ? { project: { organization_id: ctx.effectiveOrgId } } : {}),
    },
    select: {
      status: true,
      created_by: true,
      assignments: { where: { user_id: ctx.actorUserId } },
    },
  });
  if (!commentTask || !canAccessTask(commentTask, ctx)) throw new CommentNotFoundError();
  if (commentTask.status === TaskStatus.ARCHIVED) {
    throw new TaskArchivedError();
  }

  if (!canModifyComment(comment, ctx)) throw new CommentForbiddenError();

  // Fetch GCS paths before the transaction so we have them for post-commit cleanup.
  let gcsPathsToDelete: string[] = [];
  if (removeAttachmentIds && removeAttachmentIds.length > 0) {
    const attachmentsToRemove = await attachmentRepo.getAttachmentsByCommentId(commentId);
    gcsPathsToDelete = attachmentsToRemove
      .filter((a) => removeAttachmentIds.includes(a.attachment_id))
      .map((a) => a.gcs_path);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await commentRepo.updateComment(tx, commentId, message, uploadTokens, removeAttachmentIds);

    await taskEventRepo.createTaskEvent(tx, {
      task: { connect: { task_id: comment.task_id } },
      actor: { connect: { user_id: ctx.actorUserId } },
      type: TaskEventType.COMMENT_UPDATED,
      message: "Comment updated",
      comment: { connect: { comment_id: comment.comment_id } },
      before_json: comment,
      after_json: updated.comment,
    });

    return updated;
  });
  const updatedComment = result.comment;

  // Delete GCS files only after the DB transaction succeeds.
  if (gcsPathsToDelete.length > 0) {
    await Promise.all(
      gcsPathsToDelete.map((path) =>
        deleteFile(path).catch((err) =>
          console.error("GCS delete failed for path:", path, err),
        ),
      ),
    );
  }

  return updatedComment;
}

export async function deleteComment(ctx: RequestContext, commentId: string) {
  const comment = await commentRepo.getCommentById(commentId);
  if (!comment) throw new CommentNotFoundError();

  // Verify the task is within org scope and not archived.
  const commentTask = await prisma.task.findFirst({
    where: {
      task_id: comment.task_id,
      ...(ctx.effectiveOrgId ? { project: { organization_id: ctx.effectiveOrgId } } : {}),
    },
    select: { status: true },
  });
  if (!commentTask) throw new CommentNotFoundError();
  if (commentTask.status === TaskStatus.ARCHIVED) {
    throw new TaskArchivedError();
  }

  // Only the comment author, admins, and super-admins may delete.
  if (!canModifyComment(comment, ctx) && ctx.actorRole !== UserRole.ADMIN && !ctx.isSuperAdmin) {
    throw new CommentForbiddenError();
  }

  // Fetch attachment GCS paths before deletion so we can clean up storage.
  const attachmentsToDelete = await attachmentRepo.getAttachmentsByCommentId(commentId);

  await prisma.$transaction(async (tx) => {
    // Log event first (comment FK must still exist for the event).
    await taskEventRepo.createTaskEvent(tx, {
      task: { connect: { task_id: comment.task_id } },
      actor: { connect: { user_id: ctx.actorUserId } },
      type: TaskEventType.COMMENT_DELETED,
      message: "Comment deleted",
      comment: { connect: { comment_id: comment.comment_id } },
      before_json: comment,
      after_json: {},
    });

    await commentRepo.deleteComment(tx, commentId);
  });

  // Non-blocking GCS cleanup — DB deletion is the source of truth.
  await Promise.all(
    attachmentsToDelete.map((a) =>
      deleteFile(a.gcs_path).catch((err) =>
        console.error("GCS delete failed for path:", a.gcs_path, err),
      ),
    ),
  );

  return true;
}
