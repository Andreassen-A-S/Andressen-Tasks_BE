import * as taskRepo from "../repositories/taskRepository";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task";
import type { Request, Response } from "express";

interface TaskParams {
  id: string;
}

export async function listTasks(req: Request, res: Response) {
  try {
    const tasks = await taskRepo.getAllTasks();
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error("Error in listTasks:", error);
    res.status(500).json({ success: false, error: "Failed to fetch tasks" });
  }
}

export async function getTask(req: Request<TaskParams>, res: Response) {
  try {
    const task = await taskRepo.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    console.error("Error in getTask:", error);
    res.status(500).json({ success: false, error: "Failed to fetch task" });
  }
}

export async function createTask(req: Request, res: Response) {
  try {
    const body = req.body as CreateTaskInput;

    if (!body.created_by) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: created_by",
      });
    }

    // Use the new function that supports assignments
    const task = await taskRepo.createTaskWithAssignments(body);
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error("Error in createTask:", error);
    res.status(400).json({ success: false, error: "Failed to create task" });
  }
}

export async function updateTask(req: Request<TaskParams>, res: Response) {
  try {
    const updateData = req.body as UpdateTaskInput;

    // Use the function with assignments if assigned_users is provided
    const task =
      updateData.assigned_users !== undefined
        ? await taskRepo.updateTaskWithAssignments(req.params.id, updateData)
        : await taskRepo.updateTask(req.params.id, updateData);

    res.json({ success: true, data: task });
  } catch (error) {
    console.error("Error in updateTask:", error);
    res.status(500).json({ success: false, error: "Failed to update task" });
  }
}

export async function deleteTask(req: Request<TaskParams>, res: Response) {
  try {
    await taskRepo.deleteTask(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error in deleteTask:", error);
    res.status(404).json({ success: false, error: "Task not found" });
  }
}
