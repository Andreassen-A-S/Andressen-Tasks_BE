import { Router } from "express";
import * as authController from "../controllers/authController";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validateMiddleware";
import { loginSchema } from "../schemas/authSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
router.post("/login", loginLimiter, validate(loginSchema), asyncHandler(authController.login));
router.get("/verify", asyncHandler(authController.verifyToken));

export default router;
