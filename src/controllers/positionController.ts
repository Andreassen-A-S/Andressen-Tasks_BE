import type { Request, Response } from "express";
import * as positionService from "../services/positionService";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";

export async function listPositions(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const positions = await positionService.listPositions(ctx);
  return res.json({ success: true, data: positions });
}

export async function createPosition(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { name } = req.body;
  const position = await positionService.createPosition(ctx, name.trim());
  return res.status(201).json({ success: true, data: position });
}

export async function updatePosition(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { name } = req.body;
  const position = await positionService.updatePosition(ctx, id, name.trim());
  return res.json({ success: true, data: position });
}

export async function deletePosition(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  await positionService.deletePosition(ctx, id);
  return res.status(204).send();
}
