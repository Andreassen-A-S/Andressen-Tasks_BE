import { Router } from "express";
import * as goalController from "../controllers/goalController";
import { authenticateToken } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";
import { validate } from "../middleware/validateMiddleware";
import { setGoalSchema } from "../schemas/goalSchemas";

const router = Router({ mergeParams: true });

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.post("/", validate(setGoalSchema), asyncHandler(goalController.setGoal));
router.delete("/", asyncHandler(goalController.removeGoal));

export default router;
