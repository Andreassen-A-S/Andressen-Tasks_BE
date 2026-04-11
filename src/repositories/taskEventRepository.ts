import { prisma } from "../db/prisma";
import type { Prisma, TaskEvent } from "../generated/prisma/client";

export async function createTaskEvent(data: Prisma.TaskEventCreateInput) {
  return prisma.taskEvent.create({ data });
}

export async function getTaskEventsByTaskId(taskId: string) {
  return prisma.taskEvent.findMany({
    where: { task_id: taskId },
    orderBy: { created_at: "asc" }, // GitHub-style: oldest -> newest
    include: {
      actor: {
        select: { user_id: true, name: true, email: true, position: true },
      },
      comment: {
        include: {
          attachments: {
            where: { status: "CONFIRMED" },
            orderBy: { created_at: "asc" },
          },
        },
      },
      assignment: {
        include: {
          user: {
            select: { user_id: true, name: true, email: true, position: true },
          },
        },
      },
      progress: {
        include: {
          assignment: {
            include: {
              user: {
                select: {
                  user_id: true,
                  name: true,
                  email: true,
                  position: true,
                },
              },
            },
          },
        },
      },
    },
  });
}
