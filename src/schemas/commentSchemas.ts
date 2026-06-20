import { z } from "zod";

export const createCommentSchema = z
  .object({
    message: z.string().trim().max(2000, "Message too long (max 2000 characters)").optional(),
    upload_tokens: z.array(z.string()).optional(),
    reply_to_comment_id: z.string().uuid("Invalid reply comment ID").optional(),
  })
  .superRefine((data, ctx) => {
    const hasMessage = !!(data.message?.length);
    const hasTokens = !!(data.upload_tokens?.length);
    if (!hasMessage && !hasTokens) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "Message or attachment is required" });
    }
    if (data.upload_tokens && new Set(data.upload_tokens).size !== data.upload_tokens.length) {
      ctx.addIssue({ code: "custom", path: ["upload_tokens"], message: "Duplicate upload tokens" });
    }
  });

export const updateCommentSchema = z
  .object({
    message: z.string().trim().max(2000, "Message too long (max 2000 characters)").optional(),
    upload_tokens: z.array(z.string()).optional(),
    remove_attachment_ids: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    const hasMessage = !!(data.message?.length);
    const hasTokens = !!(data.upload_tokens?.length);
    const hasRemovals = !!(data.remove_attachment_ids?.length);
    if (!hasMessage && !hasTokens && !hasRemovals) {
      ctx.addIssue({ code: "custom", path: ["_root"], message: "No changes provided" });
    }
    if (data.upload_tokens && new Set(data.upload_tokens).size !== data.upload_tokens.length) {
      ctx.addIssue({ code: "custom", path: ["upload_tokens"], message: "Duplicate upload tokens" });
    }
  });
