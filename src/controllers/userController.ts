import type { Request, Response } from "express";
import type { CreateUserInput, UpdateUserInput } from "../types/user";
import { getRequestContext } from "../types/requestContext";
import * as userService from "../services/userService";

export async function listUsers(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const users = await userService.listUsers(ctx);
  res.json({ success: true, data: users });
}

export async function getUser(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const user = await userService.getUser(ctx, req.params.id as string);
  if (!user) return res.status(404).json({ success: false, error: "User not found" });
  res.json({ success: true, data: user });
}

export async function createUser(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const user = await userService.createUser(ctx, req.body as CreateUserInput);
  res.status(201).json({ success: true, data: user });
}

export async function updateUser(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  const user = await userService.updateUser(ctx, req.params.id as string, req.body as UpdateUserInput);
  res.json({ success: true, data: user });
}

export async function registerPushToken(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { push_token } = req.body;
  await userService.registerPushToken(ctx.actorUserId, push_token ?? null);
  res.json({ success: true });
}

export async function deleteUser(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });
  await userService.deleteUser(ctx, req.params.id as string);
  res.status(204).send();
}
