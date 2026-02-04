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
    console.error("Error in login:", error);

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
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const payload = authService.verifyToken(token);

    res.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
}
