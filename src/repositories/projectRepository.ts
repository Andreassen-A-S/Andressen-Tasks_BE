import { prisma } from "../db/prisma";
import type { Project } from "../generated/prisma/client";
import type { CreateProjectInput, UpdateProjectInput } from "../types/project";

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAllProjects(): Promise<Project[]> {
  return prisma.project.findMany({
    orderBy: { created_at: "asc" },
  });
}

export async function getProjectById(id: string): Promise<Project | null> {
  return prisma.project.findUnique({
    where: { project_id: id },
  });
}

export async function getProjectWithTasks(id: string) {
  return prisma.project.findUnique({
    where: { project_id: id },
    include: { tasks: { orderBy: { created_at: "desc" } } },
  });
}

// ---------------------------------------------------------------------------
// Creates
// ---------------------------------------------------------------------------

export async function createProject(
  input: CreateProjectInput,
  createdBy: string,
): Promise<Project> {
  return prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      color: input.color,
      created_by: createdBy,
    },
  });
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const existing = await prisma.project.findUnique({ where: { project_id: id } });
  if (!existing) throw new ProjectNotFoundError(id);

  return prisma.project.update({
    where: { project_id: id },
    data: input,
  });
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

export async function deleteProject(id: string): Promise<void> {
  const existing = await prisma.project.findUnique({ where: { project_id: id } });
  if (!existing) throw new ProjectNotFoundError(id);

  await prisma.project.delete({ where: { project_id: id } });
}
