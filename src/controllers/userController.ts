import type { Request, Response } from "express";
import Expo from "expo-server-sdk";
import type { CreateUserInput, UpdateUserInput } from "../types/user";
import { getRequestContext } from "../types/requestContext";
import * as userService from "../services/userService";
import {
  ForbiddenUserOperationError,
  InvalidUserRoleError,
  MissingOrganizationError,
  RequiredOrganizationIdError,
} from "../errors/domainErrors";

function handleUserServiceError(error: unknown, res: Response, notFoundMessage: string) {
  if (error instanceof ForbiddenUserOperationError) {
    return res.status(403).json({ success: false, error: error.message });
  }
  if (error instanceof InvalidUserRoleError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof RequiredOrganizationIdError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (error instanceof MissingOrganizationError) {
    return res.status(403).json({ success: false, error: error.message });
  }
  console.error(notFoundMessage, error);
  return res.status(404).json({ success: false, error: notFoundMessage });
}

export async function listUsers(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
    const users = await userService.listUsers(ctx);
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Error in listUsers:", error);
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
}

export async function getUser(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
    const user = await userService.getUser(ctx, req.params.id as string);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Error in getUser:", error);
    res.status(500).json({ success: false, error: "Failed to fetch user" });
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
    const body = req.body as CreateUserInput;
    const user = await userService.createUser(ctx, body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (
      error instanceof ForbiddenUserOperationError ||
      error instanceof InvalidUserRoleError ||
      error instanceof MissingOrganizationError ||
      error instanceof RequiredOrganizationIdError
    ) {
      return handleUserServiceError(error, res, "Failed to create user");
    }
    console.error("Error in createUser:", error);
    return res.status(400).json({ success: false, error: "Failed to create user" });
  }
}

export async function updateUser(req: Request, res: Response) {
  const targetId = req.params.id as string;

  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
    const body = req.body as UpdateUserInput;
    const user = await userService.updateUser(ctx, targetId, body);
    res.json({ success: true, data: user });
  } catch (error) {
    return handleUserServiceError(error, res, "User not found or update failed");
  }
}

export async function registerPushToken(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { push_token } = req.body;

  // Validate token format before passing to the service.
  if (push_token !== null && push_token !== undefined) {
    if (typeof push_token !== "string" || !Expo.isExpoPushToken(push_token)) {
      return res.status(400).json({ success: false, error: "Invalid push token" });
    }
  }

  try {
    await userService.registerPushToken(ctx.actorUserId, push_token ?? null);
    res.json({ success: true });
  } catch (error) {
    console.error("Error in registerPushToken:", error);
    res.status(500).json({ success: false, error: "Failed to update push token" });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
    await userService.deleteUser(ctx, req.params.id as string);
    res.status(204).send();
  } catch (error) {
    return handleUserServiceError(error, res, "User not found");
  }
}
