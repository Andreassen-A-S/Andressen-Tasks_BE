import { Router } from "express";
import * as taskEventController from "../controllers/taskEventController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

router.get("/:taskId", authenticateToken, taskEventController.listTaskEvents);
router.post("/", authenticateToken, taskEventController.createTaskEvent);

export default router;
