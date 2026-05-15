import type { Request, Response } from "express";
import * as projectService from "../services/projectService";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";

export async function listProjects(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const projects = await projectService.listProjects(ctx);
  return res.json({ success: true, data: projects });
}

export async function getProject(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const project = await projectService.getProject(ctx, id);
  if (!project) return res.status(404).json({ success: false, error: "Project not found" });
  return res.json({ success: true, data: project });
}

export async function createProject(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  if (!ctx.effectiveOrgId) {
    return res.status(403).json({ success: false, error: "No organization assigned" });
  }

  const { name, description, color } = req.body;
  const project = await projectService.createProject(ctx, { name: name.trim(), description, color });
  return res.status(201).json({ success: true, data: project });
}

export async function updateProject(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const { name, description, color } = req.body;
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  const project = await projectService.updateProject(ctx, id, { name: name?.trim(), description, color });
  return res.json({ success: true, data: project });
}

export async function deleteProject(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  await projectService.deleteProject(ctx, id);
  return res.status(204).send();
}
