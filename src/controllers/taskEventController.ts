import type { Request, Response } from "express";
import * as taskService from "../services/taskService";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as storageService from "../services/storageService";
import { getRequestContext } from "../types/requestContext";
import { handleError } from "../middleware/errorMiddleware";
import { prisma } from "../db/prisma";

export async function listTaskEvents(req: Request, res: Response) {
  const taskId = req.params.taskId as string;
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const events = await taskService.getTaskEvents(ctx, taskId);
    if (events === null) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Sign attachment URLs in the presentation layer — display logic, not business logic.
    const eventsWithSignedUrls = await Promise.all(
      events.map(async (event) => {
        if (!event.comment?.attachments?.length) return event;
        const signedAttachments = await Promise.all(
          event.comment.attachments.map(async (a: any) => {
            try {
              return { ...a, url: await storageService.generateSignedReadUrl(a.gcs_path) };
            } catch {
              return a;
            }
          }),
        );
        return { ...event, comment: { ...event.comment, attachments: signedAttachments } };
      }),
    );

    res.json({ success: true, data: eventsWithSignedUrls });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function createTaskEvent(req: Request, res: Response) {
  try {
    const event = await taskEventRepo.createTaskEvent(prisma, req.body);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    return handleError(error, res);
  }
}
