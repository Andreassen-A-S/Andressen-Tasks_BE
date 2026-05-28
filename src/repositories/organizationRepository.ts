import { prisma } from "../db/prisma";
import type { Organization } from "../generated/prisma/client";
import { getPublicAssetUrl } from "../services/storageService";
import { OrganizationNotFoundError } from "../errors/domainErrors";

// Re-export for backward compatibility with imports from this module.
export { OrganizationNotFoundError } from "../errors/domainErrors";

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  logo_url?: string | null;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  logo_url?: string | null;
}

function withPublicLogo<T extends { logo_url: string | null }>(org: T): T {
  if (!org.logo_url) return org;
  if (!isOrgLogoPath(org.logo_url)) return org;
  return { ...org, logo_url: getPublicAssetUrl(org.logo_url) };
}

export function isOrgLogoPath(value: string): boolean {
  return /^orgs\/[^/]+\/logo\.(jpe?g|png|webp|heic)$/i.test(value);
}

export async function getAllOrganizations() {
  const orgs = await prisma.organization.findMany({
    orderBy: { created_at: "asc" },
    include: { _count: { select: { users: true, projects: true } } },
  });
  return orgs.map(withPublicLogo);
}

export async function getOrganizationById(id: string) {
  const org = await prisma.organization.findUnique({
    where: { org_id: id },
    include: { _count: { select: { users: true, projects: true } } },
  });
  if (!org) return null;
  return withPublicLogo(org);
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) return null;
  return withPublicLogo(org);
}

export async function createOrganization(data: CreateOrganizationInput): Promise<Organization> {
  const org = await prisma.organization.create({ data });
  return withPublicLogo(org);
}

export async function updateOrganization(
  id: string,
  data: UpdateOrganizationInput,
): Promise<Organization> {
  const existing = await prisma.organization.findUnique({ where: { org_id: id } });
  if (!existing) throw new OrganizationNotFoundError(id);
  const org = await prisma.organization.update({ where: { org_id: id }, data });
  return withPublicLogo(org);
}

export async function deleteOrganization(id: string): Promise<void> {
  const existing = await prisma.organization.findUnique({ where: { org_id: id } });
  if (!existing) throw new OrganizationNotFoundError(id);
  await prisma.organization.delete({ where: { org_id: id } });
}
