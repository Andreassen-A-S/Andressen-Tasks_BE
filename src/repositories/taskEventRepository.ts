import { prisma } from "../db/prisma";
import type { Prisma } from "../generated/prisma/client";
import { AttachmentStatus } from "../generated/prisma/client";
import type { DbClient } from "../types/db";

const userPositionSelect = {
  user_id: true,
  name: true,
  email: true,
  position_id: true,
  position: { select: { position_id: true, name: true } },
} as const;

export async function createTaskEvent(db: DbClient, data: Prisma.TaskEventCreateInput) {
  return (db as any).taskEvent.create({ data });
}

export async function getTaskEventsByTaskId(taskId: string) {
  return prisma.taskEvent.findMany({
    where: { task_id: taskId },
    orderBy: { created_at: "asc" }, // GitHub-style: oldest -> newest
    include: {
      actor: { select: userPositionSelect },
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
          user: { select: userPositionSelect },
        },
      },
      progress: {
        include: {
          assignment: {
            include: {
              user: { select: userPositionSelect },
            },
          },
        },
      },
    },
  });
}
