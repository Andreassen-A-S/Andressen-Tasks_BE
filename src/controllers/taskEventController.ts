import type { Request, Response } from "express";
import * as taskEventRepo from "../repositories/taskEventRepository";

export async function listTaskEvents(req: Request, res: Response) {
  const taskId = req.params.taskId as string;
  try {
    const events = await taskEventRepo.getTaskEventsByTaskId(taskId);
    res.json({ success: true, data: events });
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
