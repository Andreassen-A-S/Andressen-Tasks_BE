import { Router } from "express";
import * as projectController from "../controllers/projectController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createProjectSchema, updateProjectSchema } from "../schemas/projectSchemas";

const router = Router();

router.get("/", authenticateToken, projectController.listProjects);
router.post("/", authenticateToken, validate(createProjectSchema), projectController.createProject);
router.get("/:id", authenticateToken, projectController.getProject);
router.patch("/:id", authenticateToken, validate(updateProjectSchema), projectController.updateProject);
router.delete("/:id", authenticateToken, projectController.deleteProject);

export default router;
