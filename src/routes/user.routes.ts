import { Router } from "express";
import * as userController from "../controllers/userController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { registerPushTokenSchema } from "../schemas/userSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

router.get("/", authenticateToken, asyncHandler(userController.listUsers));
router.post("/", authenticateToken, asyncHandler(userController.createUser));
router.post("/push-token", authenticateToken, validate(registerPushTokenSchema), asyncHandler(userController.registerPushToken));
router.get("/:id", authenticateToken, asyncHandler(userController.getUser));
router.patch("/:id", authenticateToken, asyncHandler(userController.updateUser));
router.delete("/:id", authenticateToken, asyncHandler(userController.deleteUser));

export default router;
