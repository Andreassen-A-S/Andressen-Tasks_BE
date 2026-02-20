import { Router } from "express";
import * as userController from "../controllers/userController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

router.get("/", authenticateToken, userController.listUsers);
router.post("/", authenticateToken, userController.createUser);
router.get("/:id", authenticateToken, userController.getUser);
router.patch("/:id", authenticateToken, userController.updateUser);
router.delete("/:id", authenticateToken, userController.deleteUser);

export default router;
