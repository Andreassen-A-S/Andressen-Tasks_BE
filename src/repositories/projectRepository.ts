import { prisma } from "../db/prisma";
import type { Project } from "../generated/prisma/client";
import type { CreateProjectInput, UpdateProjectInput } from "../types/project";
import { ProjectNotFoundError } from "../errors/domainErrors";

// Re-export for backward compatibility with imports from this module.
export { ProjectNotFoundError } from "../errors/domainErrors";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAllProjects(orgId: string | null): Promise<Project[]> {
  return prisma.project.findMany({
    where: orgId ? { organization_id: orgId } : undefined,
    orderBy: { created_at: "asc" },
  });
}

export async function getProjectById(id: string, orgId: string | null): Promise<Project | null> {
  return prisma.project.findFirst({
    where: { project_id: id, ...(orgId ? { organization_id: orgId } : {}) },
  });
}

export async function getProjectWithTasks(id: string, orgId: string | null) {
  return prisma.project.findFirst({
    where: { project_id: id, ...(orgId ? { organization_id: orgId } : {}) },
    include: { tasks: { orderBy: { created_at: "desc" } } },
  });
}

// ---------------------------------------------------------------------------
// Creates
// ---------------------------------------------------------------------------

export async function createProject(
  input: CreateProjectInput,
  createdBy: string,
  orgId: string,
): Promise<Project> {
  return prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      color: input.color,
      created_by: createdBy,
      organization_id: orgId,
    },
  });
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  orgId: string | null,
): Promise<Project> {
  const existing = await prisma.project.findFirst({
    where: { project_id: id, ...(orgId ? { organization_id: orgId } : {}) },
  });
  if (!existing) throw new ProjectNotFoundError(id);

  return prisma.project.update({
    where: { project_id: id },
    data: input,
  });
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

export async function deleteProject(id: string, orgId: string | null): Promise<void> {
  const existing = await prisma.project.findFirst({
    where: { project_id: id, ...(orgId ? { organization_id: orgId } : {}) },
  });
  if (!existing) throw new ProjectNotFoundError(id);

  await prisma.project.delete({ where: { project_id: id } });
}
