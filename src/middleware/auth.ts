import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService";
// import "../types/express";
import { UserRole } from "../generated/prisma/client";

function normalizeOrgId(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

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

    // Convert role to UserRole enum
    req.user = {
      ...payload,
      role: payload.role as UserRole,
    };

    const organizationId = normalizeOrgId(req.user.organization_id);

    if (req.user.role === UserRole.SUPER_ADMIN) {
      req.effectiveOrgId = normalizeOrgId(req.headers["x-org-context"]);
    } else if (organizationId) {
      req.effectiveOrgId = organizationId;
    } else {
      return res.status(403).json({
        success: false,
        error: "No organization assigned",
      });
    }

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

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== UserRole.SUPER_ADMIN) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  next();
}

export function requireAdminOrSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { role, organization_id } = req.user ?? {};
  if (role === UserRole.SUPER_ADMIN) return next();
  if (role === UserRole.ADMIN && organization_id && organization_id === req.params.id) return next();
  return res.status(403).json({ success: false, error: "Forbidden" });
}
