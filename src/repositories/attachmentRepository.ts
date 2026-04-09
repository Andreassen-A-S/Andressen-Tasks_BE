import { prisma } from "../db/prisma";
import { AttachmentStatus, AttachmentType } from "../generated/prisma/client";

export async function getImageAttachmentsByTaskId(taskId: string) {
  return prisma.taskAttachment.findMany({
    where: { task_id: taskId, type: AttachmentType.IMAGE, status: AttachmentStatus.CONFIRMED },
    orderBy: { created_at: "asc" },
    include: {
      uploader: { select: { user_id: true, name: true } },
    },
  });
}

export async function getAttachmentsByCommentId(commentId: string) {
  return prisma.taskAttachment.findMany({
    where: { comment_id: commentId, status: AttachmentStatus.CONFIRMED },
  });
}

export async function getAttachmentById(attachmentId: string) {
  return prisma.taskAttachment.findUnique({ where: { attachment_id: attachmentId } });
}

export async function deleteAttachment(attachmentId: string) {
  await prisma.taskAttachment.delete({ where: { attachment_id: attachmentId } });
}

export type PrepareAttachmentInput = {
  taskId: string;
  userId: string;
  mimeType: string;
  gcsPath: string;
  publicUrl: string;
  fileName?: string | null;
  fileSize?: number | null;
};

export async function prepareAttachment(input: PrepareAttachmentInput) {
  return prisma.taskAttachment.create({
    data: {
      task_id: input.taskId,
      uploaded_by: input.userId,
      type: AttachmentType.IMAGE,
      gcs_path: input.gcsPath,
      url: input.publicUrl,
      file_name: input.fileName ?? null,
      mime_type: input.mimeType,
      file_size: input.fileSize ?? null,
      status: AttachmentStatus.PENDING,
    },
    select: { upload_token: true },
  });
}

export async function confirmAttachments(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  uploadTokens: string[],
  commentId: string,
  userId: string,
  taskId: string,
) {
  const uniqueTokens = [...new Set(uploadTokens)];

  const attachments = await tx.taskAttachment.findMany({
    where: {
      upload_token: { in: uniqueTokens },
      uploaded_by: userId,
      task_id: taskId,
      status: AttachmentStatus.PENDING,
      comment_id: null,
    },
    select: { upload_token: true },
  });

  if (attachments.length !== uniqueTokens.length) {
    throw new Error("One or more upload tokens are invalid or expired");
  }

  const updated = await tx.taskAttachment.updateMany({
    where: {
      upload_token: { in: uniqueTokens },
      uploaded_by: userId,
      task_id: taskId,
      status: AttachmentStatus.PENDING,
      comment_id: null,
    },
    data: { status: AttachmentStatus.CONFIRMED, comment_id: commentId },
  });

  if (updated.count !== uniqueTokens.length) {
    throw new Error("One or more upload tokens are invalid or expired");
  }
}

export async function getPendingOlderThan(cutoff: Date) {
  return prisma.taskAttachment.findMany({
    where: { status: AttachmentStatus.PENDING, created_at: { lt: cutoff } },
  });
}
