import { prisma } from "../db/prisma";
import { AttachmentType } from "../generated/prisma/client";

export async function getImageAttachmentsByTaskId(taskId: string) {
  return prisma.taskAttachment.findMany({
    where: { task_id: taskId, type: AttachmentType.IMAGE },
    orderBy: { created_at: "asc" },
    include: {
      uploader: { select: { user_id: true, name: true } },
    },
  });
}

export async function getAttachmentsByCommentId(commentId: string) {
  return prisma.taskAttachment.findMany({ where: { comment_id: commentId } });
}

export async function getAttachmentById(attachmentId: string) {
  return prisma.taskAttachment.findUnique({ where: { attachment_id: attachmentId } });
}

export async function deleteAttachment(attachmentId: string) {
  await prisma.taskAttachment.delete({ where: { attachment_id: attachmentId } });
}
