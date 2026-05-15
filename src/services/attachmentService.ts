import { prisma } from "../db/prisma";
import { TaskStatus, UserRole } from "../generated/prisma/client";
import * as attachmentRepo from "../repositories/attachmentRepository";
import { generateSignedUploadUrl, generateSignedReadUrl, deleteFile, ALLOWED_MIME_TYPES } from "./storageService";
import type { RequestContext } from "../types/requestContext";
import { AttachmentNotFoundError, AttachmentAccessError, TaskNotFoundError, TaskArchivedError, PayloadTooLargeError } from "../errors/domainErrors";

export { AttachmentNotFoundError, AttachmentAccessError };

// Access rule: task creator, assigned users, admins, and super-admins can access attachments.
// Throws TaskNotFoundError if the task is outside org scope (keeps 404 behavior).
// Throws AttachmentAccessError if the user lacks role/assignment access.
async function assertTaskAccess(
  ctx: RequestContext,
  taskId: string,
): Promise<{ task_id: string; status: string; created_by: string; assignments: { user_id: string }[] }> {
  const task = await prisma.task.findFirst({
    where: {
      task_id: taskId,
      ...(ctx.effectiveOrgId ? { project: { organization_id: ctx.effectiveOrgId } } : {}),
    },
    include: { assignments: { where: { user_id: ctx.actorUserId } } },
  });

  if (!task) throw new TaskNotFoundError(taskId);

  const isAdmin = ctx.actorRole === UserRole.ADMIN || ctx.isSuperAdmin;
  if (!isAdmin && task.created_by !== ctx.actorUserId && task.assignments.length === 0) {
    throw new AttachmentAccessError();
  }

  return task as any;
}

// Prepares signed upload URLs for the given files.
// Validates task access and archived status before generating URLs.
// Input validation (file count, types, sizes) stays in the controller.
export async function prepareAttachments(
  ctx: RequestContext,
  taskId: string,
  files: { mimeType: string; fileName?: string | null; fileSize?: number | null }[],
) {
  const task = await assertTaskAccess(ctx, taskId);

  if ((task as any).status === TaskStatus.ARCHIVED) {
    throw new TaskArchivedError();
  }

  for (const f of files) {
    if (f.fileSize != null) {
      const mimeConfig = ALLOWED_MIME_TYPES[f.mimeType];
      if (mimeConfig && f.fileSize > mimeConfig.maxBytes) {
        throw new PayloadTooLargeError(`File exceeds maximum size of ${mimeConfig.maxBytes / (1024 * 1024)} MB`);
      }
    }
  }

  const created: { attachmentId: string; uploadToken: string; uploadUrl: string }[] = [];
  try {
    for (const f of files) {
      const { uploadUrl, gcsPath, url } = await generateSignedUploadUrl(taskId, f.mimeType);
      const { upload_token, attachment_id } = await attachmentRepo.prepareAttachment({
        taskId,
        userId: ctx.actorUserId,
        mimeType: f.mimeType,
        gcsPath,
        url,
        fileName: f.fileName ?? null,
        fileSize: f.fileSize ?? null,
      });
      created.push({ attachmentId: attachment_id, uploadToken: upload_token, uploadUrl });
    }
  } catch (error) {
    // Roll back any prepared attachments that were created before the error.
    await Promise.allSettled(
      created.map((c) => attachmentRepo.deleteAttachment(c.attachmentId)),
    );
    throw error;
  }

  return created.map(({ uploadToken, uploadUrl }) => ({ upload_token: uploadToken, upload_url: uploadUrl }));
}

// Returns confirmed attachments for a task with fresh signed read URLs.
export async function getAttachmentsByTask(ctx: RequestContext, taskId: string) {
  await assertTaskAccess(ctx, taskId);

  const attachments = await attachmentRepo.getAttachmentsByTaskId(taskId);
  return Promise.all(
    attachments.map(async (a) => ({
      ...a,
      url: await generateSignedReadUrl(a.gcs_path),
    })),
  );
}

// Deletes an attachment. The uploader and admins/super-admins may delete.
// Task must not be archived.
export async function deleteAttachment(ctx: RequestContext, attachmentId: string) {
  const attachment = await attachmentRepo.getAttachmentById(attachmentId);
  if (!attachment) throw new AttachmentNotFoundError();

  // Verify task is within org scope and check archived status.
  const attachmentTask = await prisma.task.findFirst({
    where: {
      task_id: attachment.task_id,
      ...(ctx.effectiveOrgId ? { project: { organization_id: ctx.effectiveOrgId } } : {}),
    },
    select: { status: true },
  });
  if (!attachmentTask) throw new AttachmentNotFoundError();

  if (attachmentTask.status === TaskStatus.ARCHIVED) {
    throw new TaskArchivedError();
  }

  const isAdmin = ctx.actorRole === UserRole.ADMIN || ctx.isSuperAdmin;
  if (attachment.uploaded_by !== ctx.actorUserId && !isAdmin) {
    throw new AttachmentAccessError();
  }

  await attachmentRepo.deleteAttachment(attachmentId);
  await deleteFile(attachment.gcs_path);

  return true;
}
