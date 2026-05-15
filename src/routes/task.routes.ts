import { Router } from "express";
import * as taskController from "../controllers/taskController";
import * as subtaskController from "../controllers/subTaskController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createTaskSchema, upsertProgressLogSchema } from "../schemas/taskSchemas";
import { createSubtaskSchema } from "../schemas/subTaskSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

router.get("/", authenticateToken, asyncHandler(taskController.listTasks));
router.post("/", authenticateToken, validate(createTaskSchema), asyncHandler(taskController.createTask));
router.get("/:id", authenticateToken, asyncHandler(taskController.getTask));
router.patch("/:id", authenticateToken, asyncHandler(taskController.updateTask));
router.delete("/:id", authenticateToken, asyncHandler(taskController.deleteTask));

router.post(
  "/:id/progress",
  authenticateToken,
  validate(upsertProgressLogSchema),
  asyncHandler(taskController.upsertProgressLog),
);

router.post("/subtasks", authenticateToken, validate(createSubtaskSchema), asyncHandler(subtaskController.createSubtask));

export default router;
