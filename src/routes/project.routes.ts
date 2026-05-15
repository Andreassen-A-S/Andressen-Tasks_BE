import { Router } from "express";
import * as projectController from "../controllers/projectController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createProjectSchema, updateProjectSchema } from "../schemas/projectSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

router.get("/", authenticateToken, asyncHandler(projectController.listProjects));
router.post("/", authenticateToken, validate(createProjectSchema), asyncHandler(projectController.createProject));
router.get("/:id", authenticateToken, asyncHandler(projectController.getProject));
router.patch("/:id", authenticateToken, validate(updateProjectSchema), asyncHandler(projectController.updateProject));
router.delete("/:id", authenticateToken, asyncHandler(projectController.deleteProject));

export default router;
