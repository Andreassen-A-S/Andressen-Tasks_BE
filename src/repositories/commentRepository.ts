import { prisma } from "../db/prisma";
import { AttachmentStatus } from "../generated/prisma/client";
import { confirmAttachments } from "./attachmentRepository";
import { signUserProfilePicture } from "./userRepository";
import type { DbClient } from "../types/db";

const COMMENT_INCLUDE = {
  author: { select: { user_id: true, name: true, email: true, profile_picture_url: true } },
  attachments: {
    where: { status: AttachmentStatus.CONFIRMED },
    orderBy: { created_at: "asc" as const },
  },
} as const;

export async function getCommentsByTaskId(taskId: string) {
  const comments = await prisma.taskComment.findMany({
    where: { task_id: taskId },
    include: COMMENT_INCLUDE,
    orderBy: { created_at: "asc" },
  });
  return Promise.all(comments.map(async (c) => ({ ...c, author: await signUserProfilePicture(c.author) })));
}

// Accepts a DbClient so the caller (service) can include this in its own transaction.
export async function createComment(
  db: DbClient,
  data: {
    task_id: string;
    user_id: string;
    message?: string;
    upload_tokens?: string[];
  },
) {
  const { upload_tokens, ...commentData } = data;

  const comment = await (db as any).taskComment.create({ data: commentData });

  if (upload_tokens && upload_tokens.length > 0) {
    await confirmAttachments(db, upload_tokens, comment.comment_id, data.user_id, data.task_id);
  }

  const created = await (db as any).taskComment.findUniqueOrThrow({
    where: { comment_id: comment.comment_id },
    include: COMMENT_INCLUDE,
  });
  return { ...created, author: await signUserProfilePicture(created.author) };
}

export async function getCommentById(commentId: string) {
  const comment = await prisma.taskComment.findUnique({
    where: { comment_id: commentId },
    include: COMMENT_INCLUDE,
  });
  if (!comment) return null;
  return { ...comment, author: await signUserProfilePicture(comment.author) };
}

// Accepts a DbClient so the caller (service) can include this in its own transaction.
// Returns the updated comment and the GCS paths of removed attachments so the caller
// can clean up GCS storage after the transaction commits.
export async function updateComment(
  db: DbClient,
  commentId: string,
  message: string | undefined,
  upload_tokens?: string[],
  remove_attachment_ids?: string[],
): Promise<{ comment: any; removedGcsPaths: string[] }> {
  const removedGcsPaths: string[] = [];

  if (remove_attachment_ids && remove_attachment_ids.length > 0) {
    // Fetch gcs_paths before deleting so we can return them for post-commit GCS cleanup.
    const toRemove = await (db as any).taskAttachment.findMany({
      where: { attachment_id: { in: remove_attachment_ids }, comment_id: commentId },
      select: { gcs_path: true },
    });
    removedGcsPaths.push(...toRemove.map((a: any) => a.gcs_path).filter(Boolean));

    await (db as any).taskAttachment.deleteMany({
      where: { attachment_id: { in: remove_attachment_ids }, comment_id: commentId },
    });
  }

  const comment = message !== undefined
    ? await (db as any).taskComment.update({ where: { comment_id: commentId }, data: { message } })
    : await (db as any).taskComment.findUniqueOrThrow({ where: { comment_id: commentId } });

  if (upload_tokens && upload_tokens.length > 0) {
    await confirmAttachments(db, upload_tokens, comment.comment_id, comment.user_id, comment.task_id);
  }

  const updatedComment = await (db as any).taskComment.findUniqueOrThrow({
    where: { comment_id: comment.comment_id },
    include: COMMENT_INCLUDE,
  });

  return { comment: updatedComment, removedGcsPaths };
}

// Accepts a DbClient so the caller (service) can include this in its own transaction.
export async function deleteComment(db: DbClient, commentId: string) {
  await (db as any).taskComment.delete({
    where: { comment_id: commentId },
  });
}
