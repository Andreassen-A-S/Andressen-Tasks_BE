import { Router } from "express";
import * as userController from "../controllers/userController";
import { authenticateToken } from "../middleware/auth";
import { validate } from "../middleware/validateMiddleware";
import { createUserSchema, prepareProfilePictureSchema, registerPushTokenSchema, updateUserSchema } from "../schemas/userSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { requireOrgAccess } from "../middleware/orgAccess";

const router = Router();

router.use(authenticateToken, asyncHandler(requireOrgAccess));

router.get("/", asyncHandler(userController.listUsers));
router.post("/", validate(createUserSchema), asyncHandler(userController.createUser));
router.post("/push-token", validate(registerPushTokenSchema), asyncHandler(userController.registerPushToken));
router.get("/:id", asyncHandler(userController.getUser));
router.patch("/:id", validate(updateUserSchema), asyncHandler(userController.updateUser));
router.post("/:id/profile-picture/prepare", validate(prepareProfilePictureSchema), asyncHandler(userController.prepareProfilePicture));
router.delete("/:id", asyncHandler(userController.deleteUser));

export default router;
