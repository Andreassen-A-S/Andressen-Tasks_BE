import type { Request, Response } from "express";
import { UserRole } from "../generated/prisma/client";
import { prisma } from "../db/prisma";
import * as taskEventRepo from "../repositories/taskEventRepository";
import * as storageService from "../services/storageService";
import { requireUserId } from "../helper/helpers";

export async function listTaskEvents(req: Request, res: Response) {
  const taskId = req.params.taskId as string;
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const isAdmin = req.user?.role === UserRole.ADMIN;
    const task = await prisma.task.findUnique({
      where: { task_id: taskId },
      include: { assignments: { where: { user_id: userId } } },
    });
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });
    if (task.created_by !== userId && task.assignments.length === 0 && !isAdmin) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const events = await taskEventRepo.getTaskEventsByTaskId(taskId);

    const eventsWithSignedUrls = await Promise.all(
      events.map(async (event) => {
        if (!event.comment?.attachments?.length) return event;
        const signedAttachments = await Promise.all(
          event.comment.attachments.map(async (a) => {
            try {
              return { ...a, url: await storageService.generateSignedReadUrl(a.gcs_path) };
            } catch {
              return a;
            }
          })
        );
        return { ...event, comment: { ...event.comment, attachments: signedAttachments } };
      })
    );

    res.json({ success: true, data: eventsWithSignedUrls });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
}

export async function createTaskEvent(req: Request, res: Response) {
  try {
    const event = await taskEventRepo.createTaskEvent(req.body);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ success: false, error: "Failed to create event" });
  }
}
