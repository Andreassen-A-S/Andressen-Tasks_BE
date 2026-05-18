import { Router } from "express";
import * as taskController from "../controllers/taskController";
import * as subtaskController from "../controllers/subTaskController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createTaskSchema, upsertProgressLogSchema } from "../schemas/taskSchemas";
import { createSubtaskSchema } from "../schemas/subTaskSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/", asyncHandler(taskController.listTasks));
router.post("/", validate(createTaskSchema), asyncHandler(taskController.createTask));
router.get("/:id", asyncHandler(taskController.getTask));
router.patch("/:id", asyncHandler(taskController.updateTask));
router.delete("/:id", asyncHandler(taskController.deleteTask));

router.post(
  "/:id/progress",
  validate(upsertProgressLogSchema),
  asyncHandler(taskController.upsertProgressLog),
);

router.post("/subtasks", validate(createSubtaskSchema), asyncHandler(subtaskController.createSubtask));

export default router;
