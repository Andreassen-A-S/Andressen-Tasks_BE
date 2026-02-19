import * as userRepo from "../repositories/userRepository";
import type { Request, Response } from "express";
import type { CreateUserInput, UpdateUserInput } from "../types/user";
import { UserRole } from "../generated/prisma/client";

function getAuthUser(req: Request) {
  return (req as any).user as { user_id: string; role: UserRole } | undefined;
}

export async function listUsers(_req: Request, res: Response) {
  try {
    const users = await userRepo.getAllUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Error in listUsers:", error);
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
}

export async function getUser(req: Request, res: Response) {
  try {
    const user = await userRepo.getUserById(req.params.id as string);
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
  if (actor?.role !== UserRole.ADMIN) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const body = req.body as CreateUserInput;
    const user = await userRepo.createUser(body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error("Error in createUser:", error);
    res.status(400).json({ success: false, error: "Failed to create user" });
  }
}

export async function updateUser(req: Request, res: Response) {
  const actor = getAuthUser(req);
  const targetId = req.params.id as string;

  if (actor?.user_id !== targetId && actor?.role !== UserRole.ADMIN) {
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

export async function deleteUser(req: Request, res: Response) {
  const actor = getAuthUser(req);
  if (actor?.role !== UserRole.ADMIN) {
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
