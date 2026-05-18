import { Router } from "express";
import * as userController from "../controllers/userController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { registerPushTokenSchema } from "../schemas/userSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/", asyncHandler(userController.listUsers));
router.post("/", asyncHandler(userController.createUser));
router.post("/push-token", validate(registerPushTokenSchema), asyncHandler(userController.registerPushToken));
router.get("/:id", asyncHandler(userController.getUser));
router.patch("/:id", asyncHandler(userController.updateUser));
router.delete("/:id", asyncHandler(userController.deleteUser));

export default router;
