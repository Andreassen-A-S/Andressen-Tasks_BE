import { describe, expect, mock, test } from "bun:test";
import type { Request, Response, NextFunction } from "express";
import { errorMiddleware } from "../src/middleware/errorMiddleware";
import {
  AuthenticationError,
  PayloadTooLargeError,
  ValidationError,
  TaskNotFoundError,
} from "../src/errors/domainErrors";

type MockResponse = Response & {
  statusCode?: number;
  body?: unknown;
};

function makeRes(): MockResponse {
  const res: MockResponse = {} as MockResponse;
  res.status = mock((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

const req = {} as Request;
const next: NextFunction = () => {};

describe("errorMiddleware", () => {
  test("maps ValidationError to 400 with fields", () => {
    const res = makeRes();
    errorMiddleware(
      new ValidationError("Validation failed", { email: "email is required" }),
      req,
      res,
      next,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Validation failed",
      fields: { email: "email is required" },
    });
  });

  test("maps ValidationError without fields to 400 with no fields key", () => {
    const res = makeRes();
    errorMiddleware(new ValidationError("Bad input"), req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Bad input" });
  });

  test("maps AuthenticationError to 401", () => {
    const res = makeRes();
    errorMiddleware(new AuthenticationError("Invalid credentials"), req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Invalid credentials" });
  });

  test("maps PayloadTooLargeError to 413", () => {
    const res = makeRes();
    errorMiddleware(new PayloadTooLargeError("File exceeds maximum size of 10 MB"), req, res, next);
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ success: false, error: "File exceeds maximum size of 10 MB" });
  });

  test("maps any AppError subclass to its declared status code", () => {
    const res = makeRes();
    errorMiddleware(new TaskNotFoundError("t1"), req, res, next);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Task not found: t1" });
  });

  test("maps generic Error to 500", () => {
    const res = makeRes();
    errorMiddleware(new Error("something exploded"), req, res, next);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, error: "Internal server error" });
  });

  test("maps non-Error thrown values to 500", () => {
    const res = makeRes();
    errorMiddleware("oops", req, res, next);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, error: "Internal server error" });
  });
});
