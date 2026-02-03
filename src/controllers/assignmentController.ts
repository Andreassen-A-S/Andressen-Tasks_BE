import * as assignmentRepo from "../repositories/assignmentRepository";
import type { Request, Response } from "express";
import type { CreateTaskAssignmentInput } from "../types/assignment";
import type { TaskAssignment } from "../generated/prisma/client";

interface AssignmentParams {
  id: string;
}

// List all assignments (with optional filters)
export async function listAssignments(req: Request, res: Response) {
  try {
    const { userId, taskId } = req.query;
    let assignments: TaskAssignment[];

    if (userId && typeof userId === "string") {
      assignments = await assignmentRepo.getUserAssignments(userId);
    } else if (taskId && typeof taskId === "string") {
      assignments = await assignmentRepo.getTaskAssignments(taskId);
    } else {
      // Get all assignments when no filters are provided
      assignments = await assignmentRepo.getAllAssignments();
    }

    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error("Error in listAssignments:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch assignments" });
  }
}

// Assign user to task
export async function assignTask(req: Request, res: Response) {
  try {
    const body = req.body as CreateTaskAssignmentInput;
    const assignment = await assignmentRepo.assignTaskToUser(body);
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    console.error("Error in assignTask:", error);
    const message =
      error instanceof Error ? error.message : "Failed to assign task";
    res.status(400).json({ success: false, error: message });
  }
}

// Get specific assignment by ID
export async function getAssignment(
  req: Request<AssignmentParams>,
  res: Response,
) {
  try {
    const assignment = await assignmentRepo.getAssignmentById(req.params.id);
    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }
    res.json({ success: true, data: assignment });
  } catch (error) {
    console.error("Error in getAssignment:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch assignment" });
  }
}

// Update assignment (e.g., mark as complete)
export async function updateAssignment(
  req: Request<AssignmentParams>,
  res: Response,
) {
  try {
    const updateData = req.body;

    // Validate that the assignment exists first
    const existingAssignment = await assignmentRepo.getAssignmentById(
      req.params.id,
    );
    if (!existingAssignment) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }

    // Update the assignment
    const assignment = await assignmentRepo.updateAssignment(
      req.params.id,
      updateData,
    );

    res.json({ success: true, data: assignment });
  } catch (error) {
    console.error("Error in updateAssignment:", error);

    // Better error handling
    if (
      error instanceof Error &&
      error.message.includes("Record to update not found")
    ) {
      res.status(404).json({ success: false, error: "Assignment not found" });
    } else {
      res
        .status(500)
        .json({ success: false, error: "Failed to update assignment" });
    }
  }
}

// Delete assignment by ID
export async function deleteAssignment(
  req: Request<AssignmentParams>,
  res: Response,
) {
  try {
    await assignmentRepo.deleteAssignment(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error in deleteAssignment:", error);
    res.status(404).json({ success: false, error: "Assignment not found" });
  }
}
