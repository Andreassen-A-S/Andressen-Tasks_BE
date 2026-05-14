import * as projectRepo from "../repositories/projectRepository";
import type { RequestContext } from "../types/requestContext";
import type { CreateProjectInput, UpdateProjectInput } from "../types/project";
import { ProjectNotFoundError } from "../errors/domainErrors";

export { ProjectNotFoundError };

// All project operations are org-scoped via effectiveOrgId.
// Super-admins use the effectiveOrgId they have been given (or null for platform-wide).

// Returns all projects in the caller's org scope.
export async function listProjects(ctx: RequestContext) {
  return projectRepo.getAllProjects(ctx.effectiveOrgId);
}

// Returns a single project with its tasks. Returns null if not found within scope.
export async function getProject(ctx: RequestContext, projectId: string) {
  return projectRepo.getProjectWithTasks(projectId, ctx.effectiveOrgId);
}

// Creates a project in the caller's org. Requires effectiveOrgId (no org → 403).
export async function createProject(ctx: RequestContext, data: CreateProjectInput) {
  return projectRepo.createProject(data, ctx.actorUserId, ctx.effectiveOrgId!);
}

// Updates a project's metadata. Throws ProjectNotFoundError if outside scope.
export async function updateProject(ctx: RequestContext, projectId: string, data: UpdateProjectInput) {
  return projectRepo.updateProject(projectId, data, ctx.effectiveOrgId);
}

// Deletes a project. Throws ProjectNotFoundError if outside scope.
export async function deleteProject(ctx: RequestContext, projectId: string) {
  return projectRepo.deleteProject(projectId, ctx.effectiveOrgId);
}
