import { prisma } from "../db/prisma";
import type { Organization } from "../generated/prisma/client";

export class OrganizationNotFoundError extends Error {
  constructor(id: string) {
    super(`Organization not found: ${id}`);
    this.name = "OrganizationNotFoundError";
  }
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  logo_url?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  logo_url?: string | null;
}

export async function getAllOrganizations(): Promise<Organization[]> {
  return prisma.organization.findMany({ orderBy: { created_at: "asc" } });
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  return prisma.organization.findUnique({ where: { org_id: id } });
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  return prisma.organization.findUnique({ where: { slug } });
}

export async function createOrganization(data: CreateOrganizationInput): Promise<Organization> {
  return prisma.organization.create({ data });
}

export async function updateOrganization(
  id: string,
  data: UpdateOrganizationInput,
): Promise<Organization> {
  const existing = await prisma.organization.findUnique({ where: { org_id: id } });
  if (!existing) throw new OrganizationNotFoundError(id);
  return prisma.organization.update({ where: { org_id: id }, data });
}

export async function deleteOrganization(id: string): Promise<void> {
  const existing = await prisma.organization.findUnique({ where: { org_id: id } });
  if (!existing) throw new OrganizationNotFoundError(id);
  await prisma.organization.delete({ where: { org_id: id } });
}
