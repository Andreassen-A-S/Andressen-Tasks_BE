import { Router } from "express";
import * as positionController from "../controllers/positionController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createPositionSchema, updatePositionSchema } from "../schemas/positionSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/", asyncHandler(positionController.listPositions));
router.post("/", validate(createPositionSchema), asyncHandler(positionController.createPosition));
router.patch("/:id", validate(updatePositionSchema), asyncHandler(positionController.updatePosition));
router.delete("/:id", asyncHandler(positionController.deletePosition));

export default router;
