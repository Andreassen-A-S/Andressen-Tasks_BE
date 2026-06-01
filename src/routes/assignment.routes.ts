import { Router } from "express";
import * as assignmentController from "../controllers/assignmentController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { assignTaskSchema } from "../schemas/assignmentSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/", asyncHandler(assignmentController.listAssignments)); // Get all assignments (with optional filters)
router.post("/", validate(assignTaskSchema), asyncHandler(assignmentController.assignTask)); // Create assignment
router.get("/:id", asyncHandler(assignmentController.getAssignment)); // Get specific assignment
router.delete("/:id", asyncHandler(assignmentController.deleteAssignment)); // Delete assignment

export default router;
