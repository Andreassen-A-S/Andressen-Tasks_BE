import { Router } from "express";
import * as taskEventController from "../controllers/taskEventController";

const router = Router();

router.get("/:taskId", taskEventController.listTaskEvents);
router.post("/", taskEventController.createTaskEvent);

export default router;
