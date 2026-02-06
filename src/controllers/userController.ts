import * as userRepo from "../repositories/userRepository";
import type { Request, Response } from "express";
import type { CreateUserInput, UpdateUserInput } from "../types/user";

interface UserParams {
  id: string;
}

export async function listUsers(req: Request, res: Response) {
  try {
    const users = await userRepo.getAllUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Error in listUsers:", error);
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
}

export async function getUser(req: Request<UserParams>, res: Response) {
  try {
    const user = await userRepo.getUserById(req.params.id);
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
    const body = req.body as CreateUserInput;
    const user = await userRepo.createUser(body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error("Error in createUser:", error);
    res.status(400).json({ success: false, error: "Failed to create user" });
  }
}

export async function updateUser(req: Request<UserParams>, res: Response) {
  try {
    const body = req.body as UpdateUserInput;
    const user = await userRepo.updateUser(req.params.id, body);
    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Error in updateUser:", error);
    res.status(404).json({
      success: false,
      error: "User not found or update failed",
    });
  }
}

export async function deleteUser(req: Request<UserParams>, res: Response) {
  try {
    await userRepo.deleteUser(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error in deleteUser:", error);
    res.status(404).json({ success: false, error: "User not found" });
  }
}
