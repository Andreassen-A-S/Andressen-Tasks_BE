import type { Request, Response } from "express";
import * as organizationService from "../services/organizationService";
import { getRequestContext } from "../types/requestContext";
import { handleError } from "../middleware/errorMiddleware";

export async function listOrganizations(_req: Request, res: Response) {
  try {
    const orgs = await organizationService.listOrganizations();
    return res.json({ success: true, data: orgs });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function getOrganization(req: Request, res: Response) {
  try {
    const org = await organizationService.getOrganization(req.params.id as string);
    if (!org) return res.status(404).json({ success: false, error: "Organization not found" });
    return res.json({ success: true, data: org });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function createOrganization(req: Request, res: Response) {
  const { name, slug, logo_url } = req.body;
  try {
    const org = await organizationService.createOrganization({ name: name.trim(), slug: slug.trim(), logo_url });
    return res.status(201).json({ success: true, data: org });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function updateOrganization(req: Request, res: Response) {
  const { name, slug, logo_url } = req.body;
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
    return handleError(error, res);
  }
}

export async function prepareOrgLogo(req: Request, res: Response) {
  const { mime_type } = req.body;
  try {
    const id = req.params.id;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ success: false, error: "Missing org id" });
    }
    const result = await organizationService.prepareLogoUpload(id, mime_type);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function deleteOrganization(req: Request, res: Response) {
  try {
    await organizationService.deleteOrganization(req.params.id as string);
    return res.status(204).send();
  } catch (error) {
    return handleError(error, res);
  }
}
