import * as orgRepo from "../repositories/organizationRepository";
import { generateOrgLogoUploadUrl } from "./storageService";
import type { RequestContext } from "../types/requestContext";
import { UserRole } from "../generated/prisma/client";
import {
  OrganizationNotFoundError,
  ProtectedOrganizationError,
  ForbiddenUserOperationError,
} from "../errors/domainErrors";
import { MESTERPLAN_ORG_ID } from "../constants";

export { OrganizationNotFoundError, ProtectedOrganizationError };

// Returns all organizations. Intended for super-admin use only (middleware enforces this).
export async function listOrganizations() {
  return orgRepo.getAllOrganizations();
}

// Returns a single organization by ID, or null if not found.
export async function getOrganization(orgId: string) {
  return orgRepo.getOrganizationById(orgId);
}

// Creates a new organization. Intended for super-admin use only.
export async function createOrganization(data: { name: string; slug: string; logo_url?: string | null }) {
  return orgRepo.createOrganization(data);
}

// Updates organization fields.
// Slug changes are restricted to super-admins as a defense-in-depth check
// (routes are already protected by requireSuperAdmin middleware).
export async function updateOrganization(
  ctx: RequestContext,
  orgId: string,
  data: { name?: string; slug?: string; logo_url?: string | null },
) {
  if (data.slug !== undefined && ctx.actorRole !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenUserOperationError("Only super admins can update organization slug");
  }
  return orgRepo.updateOrganization(orgId, data);
}

// Deletes an organization. The MesterPlan org (platform owner) is permanently protected.
export async function deleteOrganization(orgId: string) {
  if (orgId === MESTERPLAN_ORG_ID) throw new ProtectedOrganizationError();
  return orgRepo.deleteOrganization(orgId);
}

// Generates a signed GCS upload URL for the organization's logo.
// The caller must validate mime_type before calling this.
export async function prepareLogoUpload(orgId: string, mimeType: string) {
  const org = await orgRepo.getOrganizationById(orgId);
  if (!org) throw new OrganizationNotFoundError(orgId);
  return generateOrgLogoUploadUrl(orgId, mimeType);
}
