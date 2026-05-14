import type { Request, Response } from "express";
import * as projectService from "../services/projectService";
import { getRequestContext } from "../types/requestContext";
import { getParamId } from "../helper/helpers";
import { ProjectNotFoundError } from "../errors/domainErrors";

function handleDomainError(error: unknown, res: Response, fallbackMessage: string): Response {
  if (error instanceof ProjectNotFoundError) {
    return res.status(404).json({ success: false, error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

export async function listProjects(req: Request, res: Response) {
  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const projects = await projectService.listProjects(ctx);
    return res.json({ success: true, data: projects });
  } catch (error) {
    console.error("Error in listProjects:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch projects" });
  }
}

export async function getProject(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const project = await projectService.getProject(ctx, id);
    if (!project) return res.status(404).json({ success: false, error: "Project not found" });
    return res.json({ success: true, data: project });
  } catch (error) {
    return handleDomainError(error, res, "Failed to fetch project");
  }
}

export async function createProject(req: Request, res: Response) {
  const ctx = getRequestContext(req);
  if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

  if (!ctx.effectiveOrgId) {
    return res.status(403).json({ success: false, error: "No organization assigned" });
  }

  const { name, description, color } = req.body;
  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ success: false, error: "name is required" });
  }

  try {
    const project = await projectService.createProject(ctx, { name: name.trim(), description, color });
    return res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error("Error in createProject:", error);
    return res.status(500).json({ success: false, error: "Failed to create project" });
  }
}

export async function updateProject(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  const { name, description, color } = req.body;

  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
    return res.status(400).json({ success: false, error: "name must be a non-empty string" });
  }

  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const project = await projectService.updateProject(ctx, id, { name: name?.trim(), description, color });
    return res.json({ success: true, data: project });
  } catch (error) {
    return handleDomainError(error, res, "Failed to update project");
  }
}

export async function deleteProject(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    await projectService.deleteProject(ctx, id);
    return res.status(204).send();
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete project");
  }
}
