import { prisma } from "../db/prisma";
import { AttachmentStatus } from "../generated/prisma/client";
import { confirmAttachments } from "./attachmentRepository";

const COMMENT_INCLUDE = {
  author: { select: { user_id: true, name: true, email: true } },
  attachments: {
    where: { status: AttachmentStatus.CONFIRMED },
    orderBy: { created_at: "asc" as const },
  },
} as const;

export async function getCommentsByTaskId(taskId: string) {
  return prisma.taskComment.findMany({
    where: { task_id: taskId },
    include: COMMENT_INCLUDE,
    orderBy: { created_at: "asc" },
  });
}

export async function createComment(data: {
  task_id: string;
  user_id: string;
  message: string;
  uploadTokens?: string[];
}) {
  const { uploadTokens, ...commentData } = data;

  return prisma.$transaction(async (tx) => {
    const comment = await tx.taskComment.create({ data: commentData });

    if (uploadTokens && uploadTokens.length > 0) {
      await confirmAttachments(tx, uploadTokens, comment.comment_id, data.user_id, data.task_id);
    }

    return tx.taskComment.findUniqueOrThrow({
      where: { comment_id: comment.comment_id },
      include: COMMENT_INCLUDE,
    });
  });
}

export async function getCommentById(commentId: string) {
  return prisma.taskComment.findUnique({
    where: { comment_id: commentId },
    include: COMMENT_INCLUDE,
  });
}

export async function updateComment(commentId: string, message: string) {
  return prisma.taskComment.update({
    where: { comment_id: commentId },
    data: { message },
    include: COMMENT_INCLUDE,
  });
}

export async function deleteComment(commentId: string) {
  await prisma.taskComment.delete({
    where: { comment_id: commentId },
  });
}
