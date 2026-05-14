import { z } from "zod";
import { isOrgLogoPath } from "../repositories/organizationRepository";
import { ALLOWED_MIME_TYPES } from "../services/storageService";

const logoUrlField = z
  .string()
  .refine((v) => isOrgLogoPath(v), { message: "logo_url must be a valid organization logo path" })
  .nullable()
  .optional();

export const createOrganizationSchema = z.object({
  name: z.string("name is required").trim().min(1, "name is required"),
  slug: z.string("slug is required").trim().min(1, "slug is required"),
  logo_url: logoUrlField,
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1, "name must be a non-empty string").optional(),
  slug: z.string().trim().min(1, "slug must be a non-empty string").optional(),
  logo_url: logoUrlField,
});

export const prepareOrgLogoSchema = z.object({
  mime_type: z.string("mime_type is required").refine(
    (v) => v.startsWith("image/") && !!ALLOWED_MIME_TYPES[v],
    { message: "Unsupported logo mime_type" },
  ),
});
