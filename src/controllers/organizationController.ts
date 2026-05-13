import type { Request, Response } from "express";
import * as orgRepo from "../repositories/organizationRepository";
import { OrganizationNotFoundError } from "../repositories/organizationRepository";
import * as storageService from "../services/storageService";
import { MESTERPLAN_ORG_ID } from "../constants";

function handleDomainError(error: unknown, res: Response, fallbackMessage: string): Response {
  if (error instanceof OrganizationNotFoundError) {
    return res.status(404).json({ success: false, error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

export async function listOrganizations(_req: Request, res: Response) {
  try {
    const orgs = await orgRepo.getAllOrganizations();
    return res.json({ success: true, data: orgs });
  } catch (error) {
    console.error("Error in listOrganizations:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch organizations" });
  }
}

export async function getOrganization(req: Request, res: Response) {
  try {
    const org = await orgRepo.getOrganizationById(req.params.id as string);
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

  try {
    const org = await orgRepo.createOrganization({ name: name.trim(), slug: slug.trim(), logo_url });
    return res.status(201).json({ success: true, data: org });
  } catch (error) {
    console.error("Error in createOrganization:", error);
    return res.status(400).json({ success: false, error: "Failed to create organization" });
  }
}

export async function updateOrganization(req: Request, res: Response) {
  const { name, slug, logo_url } = req.body;

  try {
    const org = await orgRepo.updateOrganization(req.params.id as string, {
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
  try {
    const id = req.params.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ success: false, error: "Missing org id" });
    }
    const result = await storageService.generateOrgLogoUploadUrl(id, mime_type);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in prepareOrgLogo:", error);
    return res.status(400).json({ success: false, error: "Failed to prepare logo upload" });
  }
}


export async function deleteOrganization(req: Request, res: Response) {
  if (req.params.id === MESTERPLAN_ORG_ID) {
    return res.status(403).json({ success: false, error: "MesterPlan organisation kan ikke slettes" });
  }
  try {
    await orgRepo.deleteOrganization(req.params.id as string);
    return res.json({ success: true });
  } catch (error) {
    return handleDomainError(error, res, "Failed to delete organization");
  }
}
