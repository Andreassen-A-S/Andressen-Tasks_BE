import { Router } from "express";
import * as assignmentController from "../controllers/assignmentController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

router.get("/", authenticateToken, assignmentController.listAssignments); // Get all assignments (with optional filters)
router.post("/", authenticateToken, assignmentController.assignTask); // Create assignment
router.get("/:id", authenticateToken, assignmentController.getAssignment); // Get specific assignment
router.patch("/:id", authenticateToken, assignmentController.updateAssignment); // Update assignment (e.g., complete)
router.delete("/:id", authenticateToken, assignmentController.deleteAssignment); // Delete assignment

export default router;
