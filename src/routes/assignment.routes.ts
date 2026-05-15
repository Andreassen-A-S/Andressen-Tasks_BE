import { Router } from "express";
import * as assignmentController from "../controllers/assignmentController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { assignTaskSchema } from "../schemas/assignmentSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

router.get("/", authenticateToken, asyncHandler(assignmentController.listAssignments)); // Get all assignments (with optional filters)
router.post("/", authenticateToken, validate(assignTaskSchema), asyncHandler(assignmentController.assignTask)); // Create assignment
router.get("/:id", authenticateToken, asyncHandler(assignmentController.getAssignment)); // Get specific assignment
router.patch("/:id", authenticateToken, asyncHandler(assignmentController.updateAssignment)); // Update assignment (e.g., complete)
router.delete("/:id", authenticateToken, asyncHandler(assignmentController.deleteAssignment)); // Delete assignment

export default router;
