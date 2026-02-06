import { Router } from "express";
import * as userController from "../controllers/userController";

const router = Router();

router.get("/", userController.listUsers);
router.post("/", userController.createUser);
router.get("/:id", userController.getUser);
router.patch("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

export default router;
