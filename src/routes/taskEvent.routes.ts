import { Router } from "express";
import * as taskEventController from "../controllers/taskEventController";
import { authenticateToken } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/:taskId", asyncHandler(taskEventController.listTaskEvents));
router.post("/", asyncHandler(taskEventController.createTaskEvent));

export default router;
