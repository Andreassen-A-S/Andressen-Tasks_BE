import type { Request, Response } from "express";
import * as organizationService from "../services/organizationService";
import * as storageService from "../services/storageService";
import * as orgRepo from "../repositories/organizationRepository";
import { getRequestContext } from "../types/requestContext";
import {
  OrganizationNotFoundError,
  ProtectedOrganizationError,
  ForbiddenUserOperationError,
} from "../errors/domainErrors";

function handleDomainError(error: unknown, res: Response, fallbackMessage: string): Response {
  if (error instanceof OrganizationNotFoundError) {
    return res.status(404).json({ success: false, error: error.message });
  }
  if (error instanceof ProtectedOrganizationError) {
    return res.status(403).json({ success: false, error: "MesterPlan organization cannot be deleted" });
  }
  if (error instanceof ForbiddenUserOperationError) {
    return res.status(403).json({ success: false, error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

export async function listOrganizations(_req: Request, res: Response) {
  try {
    const orgs = await organizationService.listOrganizations();
    return res.json({ success: true, data: orgs });
  } catch (error) {
    console.error("Error in listOrganizations:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch organizations" });
  }
}

export async function getOrganization(req: Request, res: Response) {
  try {
    const org = await organizationService.getOrganization(req.params.id as string);
    if (!org) return res.status(404).json({ success: false, error: "Organization not found" });
    return res.json({ success: true, data: org });
  } catch (error) {
    console.error("Error in getOrganization:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch organization" });
  }
}

export async function createOrganization(req: Request, res: Response) {
  const { name, slug, logo_url } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ success: false, error: "name is required" });
  }
  if (!slug || typeof slug !== "string" || slug.trim() === "") {
    return res.status(400).json({ success: false, error: "slug is required" });
  }
  if (logo_url !== undefined && logo_url !== null && typeof logo_url !== "string") {
    return res.status(400).json({ success: false, error: "logo_url must be a string or null" });
  }
  if (typeof logo_url === "string" && !orgRepo.isOrgLogoPath(logo_url)) {
    return res.status(400).json({ success: false, error: "logo_url must be a valid organization logo path" });
  }

  try {
    const org = await organizationService.createOrganization({ name: name.trim(), slug: slug.trim(), logo_url });
    return res.status(201).json({ success: true, data: org });
  } catch (error) {
    console.error("Error in createOrganization:", error);
    return res.status(400).json({ success: false, error: "Failed to create organization" });
  }
}

export async function updateOrganization(req: Request, res: Response) {
  const { name, slug, logo_url } = req.body;

  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
    return res.status(400).json({ success: false, error: "name must be a non-empty string" });
  }
  if (slug !== undefined && (typeof slug !== "string" || slug.trim() === "")) {
    return res.status(400).json({ success: false, error: "slug must be a non-empty string" });
  }
  if (logo_url !== undefined && logo_url !== null && typeof logo_url !== "string") {
    return res.status(400).json({ success: false, error: "logo_url must be a string or null" });
  }
  if (typeof logo_url === "string" && !orgRepo.isOrgLogoPath(logo_url)) {
    return res.status(400).json({ success: false, error: "logo_url must be a valid organization logo path" });
  }

  try {
    const ctx = getRequestContext(req);
    if (!ctx) return res.status(401).json({ success: false, error: "Unauthorized" });

    const org = await organizationService.updateOrganization(ctx, req.params.id as string, {
      name: name?.trim(),
      slug: slug?.trim(),
      logo_url,
    });
    return res.json({ success: true, data: org });
  } catch (error) {
    return handleDomainError(error, res, "Failed to update organization");
  }
}

export async function prepareOrgLogo(req: Request, res: Response) {
  const { mime_type } = req.body;
  if (!mime_type || typeof mime_type !== "string") {
    return res.status(400).json({ success: false, error: "mime_type is required" });
  }
  if (!storageService.ALLOWED_MIME_TYPES[mime_type] || !mime_type.startsWith("image/")) {
    return res.status(400).json({ success: false, error: "Unsupported logo mime_type" });
  }
  try {
    const id = req.params.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ success: false, error: "Missing org id" });
    }
    const result = await organizationService.prepareLogoUpload(id, mime_type);
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof OrganizationNotFoundError) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }
    console.error("Error in prepareOrgLogo:", error);
    return res.status(400).json({ success: false, error: "Failed to prepare logo upload" });
  }
}

export async function deleteOrganization(req: Request, res: Response) {
  try {
    await organizationService.deleteOrganization(req.params.id as string);
    return res.status(204).send();
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete organization");
  }
}
