import * as assignmentRepo from "../repositories/assignmentRepository";
import type { Request, Response } from "express";
import type { CreateTaskAssignmentInput } from "../types/assignment";
import type { TaskAssignment } from "../generated/prisma/client";
import * as taskEventRepo from "../repositories/taskEventRepository";
import { TaskEventType } from "../generated/prisma/client";

// interface AssignmentParams {
//   id: string;
// }

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

    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: assignment.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.ASSIGNMENT_CREATED,
      message: "Assignment created",
      assignment: { connect: { assignment_id: assignment.assignment_id } },
      before_json: {},
      after_json: assignment,
    });

    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    console.error("Error in assignTask:", error);
    const message =
      error instanceof Error ? error.message : "Failed to assign task";
    res.status(400).json({ success: false, error: message });
  }
}

// Get specific assignment by ID
export async function getAssignment(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }

    const assignment = await assignmentRepo.getAssignmentById(id);

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
export async function updateAssignment(req: Request, res: Response) {
  try {
    const updateData = req.body;

    // Validate that the assignment exists first
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }

    const existingAssignment = await assignmentRepo.getAssignmentById(id);

    if (!existingAssignment) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }

    // Update the assignment
    const assignment = await assignmentRepo.updateAssignment(id, updateData);

    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: assignment.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.ASSIGNMENT_UPDATED,
      message: "Assignment updated",
      assignment: { connect: { assignment_id: assignment.assignment_id } },
      before_json: existingAssignment,
      after_json: assignment,
    });

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
export async function deleteAssignment(req: Request, res: Response) {
  try {
    // Fetch the assignment before deleting
    const { id } = req.params;
    if (!id || Array.isArray(id)) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }

    const existingAssignment = await assignmentRepo.getAssignmentById(id);
    if (!existingAssignment) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }

    // Delete the assignment
    await assignmentRepo.deleteAssignment(id);

    // TaskEvent logic
    await taskEventRepo.createTaskEvent({
      task: { connect: { task_id: existingAssignment.task_id } },
      actor: { connect: { user_id: req.user?.user_id } },
      type: TaskEventType.ASSIGNMENT_DELETED,
      message: "Assignment deleted",
      assignment: {
        connect: { assignment_id: existingAssignment.assignment_id },
      },
      before_json: existingAssignment,
      after_json: {},
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error in deleteAssignment:", error);
    res.status(404).json({ success: false, error: "Assignment not found" });
  }
}
