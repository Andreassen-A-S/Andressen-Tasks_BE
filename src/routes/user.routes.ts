import { Router } from "express";
import * as userController from "../controllers/userController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { registerPushTokenSchema } from "../schemas/userSchemas";

const router = Router();

router.get("/", authenticateToken, userController.listUsers);
router.post("/", authenticateToken, userController.createUser);
router.post("/push-token", authenticateToken, validate(registerPushTokenSchema), userController.registerPushToken);
router.get("/:id", authenticateToken, userController.getUser);
router.patch("/:id", authenticateToken, userController.updateUser);
router.delete("/:id", authenticateToken, userController.deleteUser);

export default router;
