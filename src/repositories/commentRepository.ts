import { prisma } from "../db/prisma";


export async function getCommentsByTaskId(taskId: string) {
  return prisma.taskComment.findMany({
    where: { task_id: taskId },
    include: {
      author: {
        select: {
          user_id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });
}

export async function createComment(data: {
  task_id: string;
  user_id: string;
  message: string;
}) {
  return prisma.taskComment.create({
    data,
    include: {
      author: {
        select: {
          user_id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function getCommentById(commentId: string) {
  return prisma.taskComment.findUnique({
    where: { comment_id: commentId },
    include: {
      author: {
        select: {
          user_id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function updateComment(commentId: string, message: string) {
  return prisma.taskComment.update({
    where: { comment_id: commentId },
    data: { message },
    include: {
      author: {
        select: {
          user_id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function deleteComment(commentId: string) {
  await prisma.taskComment.delete({
    where: { comment_id: commentId },
  });
}
