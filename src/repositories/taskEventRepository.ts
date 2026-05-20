import { prisma } from "../db/prisma";
import type { Prisma } from "../generated/prisma/client";
import { AttachmentStatus } from "../generated/prisma/client";
import type { DbClient } from "../types/db";
import { userSelect } from "../types/user";

export async function createTaskEvent(db: DbClient, data: Prisma.TaskEventCreateInput) {
  return (db as any).taskEvent.create({ data });
}

export async function getTaskEventsByTaskId(taskId: string) {
  return prisma.taskEvent.findMany({
    where: { task_id: taskId },
    orderBy: { created_at: "asc" }, // GitHub-style: oldest -> newest
    include: {
      actor: { select: userSelect },
      comment: {
        include: {
          attachments: {
            where: { status: AttachmentStatus.CONFIRMED },
            orderBy: { created_at: "asc" },
            select: {
              attachment_id: true,
              type: true,
              file_name: true,
              mime_type: true,
              file_size: true,
              gcs_path: true,
              url: true,
              created_at: true,
              uploaded_by: true,
            },
          },
        },
      },
      assignment: {
        include: {
          user: { select: userSelect },
        },
      },
      progress: {
        include: {
          assignment: {
            include: {
              user: { select: userSelect },
            },
          },
        },
      },
    },
  });
}
