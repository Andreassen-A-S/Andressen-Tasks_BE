import { Router } from "express";
import * as taskController from "../controllers/taskController";
import * as subtaskController from "../controllers/subTaskController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

router.get("/", taskController.listTasks);
router.post("/", authenticateToken, taskController.createTask);
router.get("/:id", taskController.getTask);
router.patch("/:id", authenticateToken, taskController.updateTask);
router.delete("/:id", authenticateToken, taskController.deleteTask);

router.post(
  "/:id/progress",
  authenticateToken,
  taskController.upsertProgressLog,
);

router.post("/subtasks", authenticateToken, subtaskController.createSubtask);

export default router;
