import type { Request, Response } from "express";
import * as authService from "../services/authService";
import type { LoginRequest, LoginResponse } from "../types/auth";

export async function login(req: Request, res: Response) {
  try {
    const credentials = req.body as LoginRequest;

    // Validate required fields
    if (!credentials.email || !credentials.password) {
      const response: LoginResponse = {
        success: false,
        error: "Email and password are required",
      };
      return res.status(400).json(response);
    }

    // Authenticate user
    const authResult = await authService.authenticateUser(credentials);

    const response: LoginResponse = {
      success: true,
      data: authResult,
    };

    res.json(response);
  } catch (error) {
    console.error("Login error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      email: req.body?.email, // Log email for debugging (not password!)
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });

    const response: LoginResponse = {
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed",
    };

    res.status(401).json(response);
  }
}

export async function verifyToken(req: Request, res: Response) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      console.warn("Token verification failed: No token provided", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        timestamp: new Date().toISOString(),
      });

      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const payload = authService.verifyToken(token);

    // Log successful verification for audit purposes
    console.info("Token verified successfully", {
      user_id: payload.user_id,
      email: payload.email,
      role: payload.role,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    // Detailed logging for debugging
    console.error("Token verification failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "UnknownError",
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      // Log first few characters of token for debugging (not the whole token!)
      tokenPrefix: req.headers.authorization?.substring(0, 20) + "...",
    });

    // Generic client response for security
    res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
}
