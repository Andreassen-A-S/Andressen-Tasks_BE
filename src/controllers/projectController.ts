import type { Request, Response } from "express";
import * as projectRepo from "../repositories/projectRepository";
import { ProjectNotFoundError } from "../repositories/projectRepository";
import { getParamId, requireUserId } from "../helper/helpers";

function handleDomainError(error: unknown, res: Response, fallbackMessage: string): Response {
  if (error instanceof ProjectNotFoundError) {
    return res.status(404).json({ success: false, error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

export async function listProjects(_req: Request, res: Response) {
  try {
    const projects = await projectRepo.getAllProjects();
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
    const project = await projectRepo.getProjectWithTasks(id);
    if (!project) return res.status(404).json({ success: false, error: "Project not found" });
    return res.json({ success: true, data: project });
  } catch (error) {
    return handleDomainError(error, res, "Failed to fetch project");
  }
}

export async function createProject(req: Request, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { name, description, color } = req.body;
  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ success: false, error: "name is required" });
  }

  try {
    const project = await projectRepo.createProject({ name: name.trim(), description, color }, userId);
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

  try {
    const project = await projectRepo.updateProject(id, { name, description, color });
    return res.json({ success: true, data: project });
  } catch (error) {
    return handleDomainError(error, res, "Failed to update project");
  }
}

export async function deleteProject(req: Request, res: Response) {
  const id = getParamId(req);
  if (!id) return res.status(400).json({ success: false, error: "Missing or invalid id" });

  try {
    await projectRepo.deleteProject(id);
    return res.json({ success: true });
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete project");
  }
}
