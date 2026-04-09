import { prisma } from "../db/prisma";
import { AttachmentType } from "../generated/prisma/client";

const COMMENT_INCLUDE = {
  author: { select: { user_id: true, name: true, email: true } },
  attachments: {
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

export type AttachmentInput = {
  gcs_path: string;
  public_url?: string; // overwritten server-side — clients need not supply this
  file_name?: string | null;
  mime_type?: string | null;
  type?: AttachmentType;
};

export async function createComment(data: {
  task_id: string;
  user_id: string;
  message: string;
  attachments?: AttachmentInput[];
}) {
  const { attachments, ...commentData } = data;

  return prisma.$transaction(async (tx) => {
    const comment = await tx.taskComment.create({ data: commentData });

    if (attachments && attachments.length > 0) {
      await tx.taskAttachment.createMany({
        data: attachments.map((a) => ({
          comment_id: comment.comment_id,
          task_id: comment.task_id,
          uploaded_by: comment.user_id,
          type: a.type ?? AttachmentType.IMAGE,
          gcs_path: a.gcs_path,
          public_url: a.public_url!,
          file_name: a.file_name ?? null,
          mime_type: a.mime_type ?? null,
        })),
      });
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
