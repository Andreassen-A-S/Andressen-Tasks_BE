import { Router } from "express";
import * as assignmentController from "../controllers/assignmentController.ts";

const router = Router();

router.get("/", assignmentController.listAssignments); // Get all assignments (with optional filters)
router.post("/", assignmentController.assignTask); // Create assignment
router.get("/:id", assignmentController.getAssignment); // Get specific assignment
router.patch("/:id", assignmentController.updateAssignment); // Update assignment (e.g., complete)
router.delete("/:id", assignmentController.deleteAssignment); // Delete assignment

export default router;
