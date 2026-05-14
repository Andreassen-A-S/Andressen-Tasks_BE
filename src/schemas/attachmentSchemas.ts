import { z } from "zod";
import { ALLOWED_MIME_TYPES } from "../services/storageService";

const MAX_FILES_PER_REQUEST = 20;

const fileSchema = z
  .object({
    file_name: z.string().nullable().optional(),
    mime_type: z.string("mime_type is required").refine(
      (v) => !!ALLOWED_MIME_TYPES[v],
      { message: "Unsupported file type" },
    ),
    file_size: z
      .number()
      .int("file_size must be an integer")
      .nonnegative("file_size must be non-negative")
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.file_size != null && data.mime_type) {
      const mimeConfig = ALLOWED_MIME_TYPES[data.mime_type];
      if (mimeConfig && data.file_size > mimeConfig.maxBytes) {
        ctx.addIssue({
          code: "custom",
          path: ["file_size"],
          message: `File exceeds maximum size of ${mimeConfig.maxBytes / (1024 * 1024)} MB`,
        });
      }
    }
  });

export const prepareAttachmentsSchema = z.object({
  task_id: z.string("task_id is required").min(1, "task_id is required"),
  files: z
    .array(fileSchema)
    .min(1, "files is required")
    .max(MAX_FILES_PER_REQUEST, `Maximum ${MAX_FILES_PER_REQUEST} files per request`),
});
