import * as userRepo from "../repositories/userRepository";
import type { Request, Response } from "express";
import type { CreateUserInput, UpdateUserInput } from "../types/user";
import { UserRole } from "../generated/prisma/client";
import Expo from "expo-server-sdk";

function getAuthUser(req: Request) {
  return req.user as { user_id: string; role: UserRole; organization_id: string | null } | undefined;
}

export async function listUsers(req: Request, res: Response) {
  try {
    const orgId = req.effectiveOrgId;
    const users = await userRepo.getAllUsers(orgId);
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Error in listUsers:", error);
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
}

export async function getUser(req: Request, res: Response) {
  try {
    const orgId = req.effectiveOrgId;
    const user = await userRepo.getUserById(req.params.id as string, orgId);
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
  const actor = getAuthUser(req);
  if (actor?.role !== UserRole.ADMIN && actor?.role !== UserRole.SUPER_ADMIN) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const body = req.body as CreateUserInput;
    // ADMIN creates users in their own org; SUPER_ADMIN must supply organization_id in the body
    let organization_id: string | null | undefined;
    if (actor.role === UserRole.SUPER_ADMIN) {
      organization_id = typeof body.organization_id === "string" && body.organization_id.trim() !== ""
        ? body.organization_id.trim()
        : null;
      if (!organization_id) {
        return res.status(400).json({ success: false, error: "organization_id is required" });
      }
    } else {
      organization_id = actor.organization_id;
      if (!organization_id) {
        return res.status(403).json({ success: false, error: "No organization assigned" });
      }
    }
    const user = await userRepo.createUser({ ...body, organization_id });
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error("Error in createUser:", error);
    res.status(400).json({ success: false, error: "Failed to create user" });
  }
}

export async function updateUser(req: Request, res: Response) {
  const actor = getAuthUser(req);
  const targetId = req.params.id as string;

  if (
    actor?.user_id !== targetId &&
    actor?.role !== UserRole.ADMIN &&
    actor?.role !== UserRole.SUPER_ADMIN
  ) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const body = req.body as UpdateUserInput;
    const user = await userRepo.updateUser(targetId, body);
    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Error in updateUser:", error);
    res.status(404).json({
      success: false,
      error: "User not found or update failed",
    });
  }
}

export async function registerPushToken(req: Request, res: Response) {
  const actor = getAuthUser(req);
  if (!actor) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { push_token } = req.body;

  if (push_token !== null && push_token !== undefined) {
    if (typeof push_token !== "string" || !Expo.isExpoPushToken(push_token)) {
      return res.status(400).json({ success: false, error: "Invalid push token" });
    }
  }

  try {
    await userRepo.updatePushToken(actor.user_id, push_token ?? null);
    res.json({ success: true });
  } catch (error) {
    console.error("Error in registerPushToken:", error);
    res.status(500).json({ success: false, error: "Failed to update push token" });
  }
}

export async function deleteUser(req: Request, res: Response) {
  const actor = getAuthUser(req);
  if (actor?.role !== UserRole.ADMIN && actor?.role !== UserRole.SUPER_ADMIN) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    await userRepo.deleteUser(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    console.error("Error in deleteUser:", error);
    res.status(404).json({ success: false, error: "User not found" });
  }
}
