import { z } from "zod";
import { ALLOWED_MIME_TYPES } from "../services/storageService";

const MAX_FILES_PER_REQUEST = 20;

const fileSchema = z.object({
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
  width: z.number().int().positive().max(32767).nullable().optional(),
  height: z.number().int().positive().max(32767).nullable().optional(),
}).superRefine((file, ctx) => {
  const hasWidth = file.width != null;
  const hasHeight = file.height != null;
  if (hasWidth !== hasHeight) {
    ctx.addIssue({
      code: "custom",
      path: [hasWidth ? "height" : "width"],
      message: "width and height must be provided together",
    });
  }
});

export const prepareAttachmentsSchema = z.object({
  task_id: z.string("task_id is required").trim().min(1, "task_id is required"),
  files: z
    .array(fileSchema)
    .min(1, "files is required")
    .max(MAX_FILES_PER_REQUEST, `Maximum ${MAX_FILES_PER_REQUEST} files per request`),
});
