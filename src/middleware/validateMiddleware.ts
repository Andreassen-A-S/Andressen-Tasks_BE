import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors/domainErrors";

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
        if (!fields[key]) fields[key] = issue.message;
      }
      next(new ValidationError("Validation failed", fields));
      return;
    }
    req.body = result.data;
    next();
  };
}
