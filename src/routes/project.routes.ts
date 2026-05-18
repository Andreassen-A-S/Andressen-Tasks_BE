import { Router } from "express";
import * as projectController from "../controllers/projectController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createProjectSchema, updateProjectSchema } from "../schemas/projectSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/", asyncHandler(projectController.listProjects));
router.post("/", validate(createProjectSchema), asyncHandler(projectController.createProject));
router.get("/:id", asyncHandler(projectController.getProject));
router.patch("/:id", validate(updateProjectSchema), asyncHandler(projectController.updateProject));
router.delete("/:id", asyncHandler(projectController.deleteProject));

export default router;
