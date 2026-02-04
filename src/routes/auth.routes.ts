import { Router } from "express";
import * as authController from "../controllers/authController";
import rateLimit from "express-rate-limit";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 10 login requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
router.post("/login", loginLimiter, authController.login);
router.get("/verify", authController.verifyToken);

export default router;
