import { Router } from "express";
import * as taskEventController from "../controllers/taskEventController";
import { authenticateToken } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

router.get("/:taskId", authenticateToken, asyncHandler(taskEventController.listTaskEvents));
router.post("/", authenticateToken, asyncHandler(taskEventController.createTaskEvent));

export default router;
