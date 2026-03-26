import { Router } from "express";
import * as projectController from "../controllers/projectController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

router.get("/", authenticateToken, projectController.listProjects);
router.post("/", authenticateToken, projectController.createProject);
router.get("/:id", authenticateToken, projectController.getProject);
router.patch("/:id", authenticateToken, projectController.updateProject);
router.delete("/:id", authenticateToken, projectController.deleteProject);

export default router;
