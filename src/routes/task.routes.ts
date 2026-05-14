import { Router } from "express";
import * as taskController from "../controllers/taskController";
import * as subtaskController from "../controllers/subTaskController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createTaskSchema, upsertProgressLogSchema } from "../schemas/taskSchemas";
import { createSubtaskSchema } from "../schemas/subTaskSchemas";

const router = Router();

router.get("/", authenticateToken, taskController.listTasks);
router.post("/", authenticateToken, validate(createTaskSchema), taskController.createTask);
router.get("/:id", authenticateToken, taskController.getTask);
router.patch("/:id", authenticateToken, taskController.updateTask);
router.delete("/:id", authenticateToken, taskController.deleteTask);

router.post(
  "/:id/progress",
  authenticateToken,
  validate(upsertProgressLogSchema),
  taskController.upsertProgressLog,
);

router.post("/subtasks", authenticateToken, validate(createSubtaskSchema), subtaskController.createSubtask);

export default router;
