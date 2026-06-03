import { Router } from "express";
import * as authController from "../controllers/authController";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validateMiddleware";
import { loginSchema } from "../schemas/authSchemas";
import { asyncHandler } from "../middleware/errorMiddleware";
import { authenticateToken } from "../middleware/auth";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // higher ceiling — called silently on every app open and 401
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post("/refresh", refreshLimiter, asyncHandler(authController.refresh));
router.post("/switch-account", asyncHandler(authController.switchAccount));
router.post("/logout", asyncHandler(authController.logout));
router.get("/sessions", authenticateToken, asyncHandler(authController.getSessions));
router.delete("/sessions/all", authenticateToken, asyncHandler(authController.revokeAllSessions));
router.delete("/sessions/:id", authenticateToken, asyncHandler(authController.revokeSession));

export default router;
