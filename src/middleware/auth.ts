import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService";
import "../types/express"; // Add this line

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const payload = authService.verifyToken(token);

    // Add user data to request object
    req.user = payload;

    next();
  } catch (error) {
    console.error("Token verification failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });

    res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
}
