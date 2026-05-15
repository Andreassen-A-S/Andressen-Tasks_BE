import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { ValidationError } from "../errors/domainErrors";

function buildBody(error: AppError): Record<string, unknown> {
  const body: Record<string, unknown> = { success: false, error: error.message };
  if (error instanceof ValidationError && error.fields) body.fields = error.fields;
  return body;
}

// Wraps an async route handler so thrown errors are forwarded to errorMiddleware via next().
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// Express error middleware — catches anything passed to next(err) or thrown
// outside a try/catch (e.g. CORS errors, unexpected throws in middleware).
// Must be registered last in server.ts with exactly 4 parameters.
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildBody(err));
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error" });
}
