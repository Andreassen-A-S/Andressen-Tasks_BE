import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import * as positionController from "../src/controllers/positionController";
import * as positionRepo from "../src/repositories/positionRepository";
import { UserRole } from "../src/generated/prisma/client";
import { PositionNotFoundError } from "../src/errors/domainErrors";
import { errorMiddleware } from "../src/middleware/errorMiddleware";

async function callController(
  fn: (req: Request, res: Response) => Promise<void>,
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await (fn as any)(req, res);
  } catch (err) {
    errorMiddleware(err, req, res, () => {});
  }
}

type MockResponse = Response & {
  statusCode?: number;
  body?: unknown;
};

function createMockResponse(): MockResponse {
  const res: MockResponse = {} as MockResponse;
  res.status = mock((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  res.send = mock(() => res) as unknown as Response["send"];
  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return { params: {}, body: {}, ...overrides } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("positionController.listPositions", () => {
  test("returns positions", async () => {
    const positions = [{ position_id: "p1", name: "Murer" }];
    spyOn(positionRepo, "getAllPositions").mockResolvedValue(positions as never);
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
    });
    const res = createMockResponse();

    await callController(positionController.listPositions, req, res);

    expect(res.body).toEqual({ success: true, data: positions });
  });

  test("returns 401 when unauthenticated", async () => {
    const repoSpy = spyOn(positionRepo, "getAllPositions");
    const req = createRequest({ user: undefined });
    const res = createMockResponse();

    await callController(positionController.listPositions, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("positionController.createPosition", () => {
  test("creates position when admin", async () => {
    const position = { position_id: "p1", name: "Murer", organization_id: "org1" };
    const createSpy = spyOn(positionRepo, "createPosition").mockResolvedValue(position as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      body: { name: "Murer" },
    });
    const res = createMockResponse();

    await callController(positionController.createPosition, req, res);

    expect(createSpy).toHaveBeenCalledWith("org1", "Murer");
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: position });
  });

  test("creates position when superadmin with org context", async () => {
    const position = { position_id: "p1", name: "Tømrer", organization_id: "org1" };
    const createSpy = spyOn(positionRepo, "createPosition").mockResolvedValue(position as never);
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: "org1",
      body: { name: "Tømrer" },
    });
    const res = createMockResponse();

    await callController(positionController.createPosition, req, res);

    expect(createSpy).toHaveBeenCalledWith("org1", "Tømrer");
    expect(res.statusCode).toBe(201);
  });

  test("returns 403 when USER", async () => {
    const repoSpy = spyOn(positionRepo, "createPosition");
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      body: { name: "Murer" },
    });
    const res = createMockResponse();

    await callController(positionController.createPosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Forbidden" });
  });

  test("returns 403 when superadmin has no org context", async () => {
    const repoSpy = spyOn(positionRepo, "createPosition");
    const req = createRequest({
      user: { user_id: "super1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: null,
      body: { name: "Murer" },
    });
    const res = createMockResponse();

    await callController(positionController.createPosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("returns 401 when unauthenticated", async () => {
    const repoSpy = spyOn(positionRepo, "createPosition");
    const req = createRequest({ user: undefined, body: { name: "Murer" } });
    const res = createMockResponse();

    await callController(positionController.createPosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("positionController.updatePosition", () => {
  test("updates position when admin", async () => {
    const position = { position_id: "p1", name: "Elektriker" };
    const updateSpy = spyOn(positionRepo, "updatePosition").mockResolvedValue(position as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "p1" } as Request["params"],
      body: { name: "Elektriker" },
    });
    const res = createMockResponse();

    await callController(positionController.updatePosition, req, res);

    expect(updateSpy).toHaveBeenCalledWith("p1", "org1", "Elektriker");
    expect(res.body).toEqual({ success: true, data: position });
  });

  test("returns 404 when position not found", async () => {
    spyOn(positionRepo, "updatePosition").mockRejectedValue(new PositionNotFoundError("p1"));
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "p1" } as Request["params"],
      body: { name: "Elektriker" },
    });
    const res = createMockResponse();

    await callController(positionController.updatePosition, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Position not found: p1" });
  });

  test("returns 403 when USER", async () => {
    const repoSpy = spyOn(positionRepo, "updatePosition");
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "p1" } as Request["params"],
      body: { name: "Elektriker" },
    });
    const res = createMockResponse();

    await callController(positionController.updatePosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("returns 400 when id is missing", async () => {
    const repoSpy = spyOn(positionRepo, "updatePosition");
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: {} as Request["params"],
      body: { name: "Elektriker" },
    });
    const res = createMockResponse();

    await callController(positionController.updatePosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  test("returns 401 when unauthenticated", async () => {
    const repoSpy = spyOn(positionRepo, "updatePosition");
    const req = createRequest({
      user: undefined,
      params: { id: "p1" } as Request["params"],
      body: { name: "Elektriker" },
    });
    const res = createMockResponse();

    await callController(positionController.updatePosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("positionController.deletePosition", () => {
  test("deletes position when admin", async () => {
    const deleteSpy = spyOn(positionRepo, "deletePosition").mockResolvedValue(undefined as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "p1" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(positionController.deletePosition, req, res);

    expect(deleteSpy).toHaveBeenCalledWith("p1", "org1");
    expect(res.statusCode).toBe(204);
  });

  test("returns 404 when position not found", async () => {
    spyOn(positionRepo, "deletePosition").mockRejectedValue(new PositionNotFoundError("p1"));
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "p1" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(positionController.deletePosition, req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Position not found: p1" });
  });

  test("returns 403 when USER", async () => {
    const repoSpy = spyOn(positionRepo, "deletePosition");
    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER, organization_id: "org1" },
      effectiveOrgId: "org1",
      params: { id: "p1" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(positionController.deletePosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test("admin from org A cannot delete position from org B", async () => {
    const deleteSpy = spyOn(positionRepo, "deletePosition").mockRejectedValue(
      new PositionNotFoundError("p-org-b"),
    );
    const req = createRequest({
      user: { user_id: "admin-a", role: UserRole.ADMIN, organization_id: "org-a" },
      effectiveOrgId: "org-a",
      params: { id: "p-org-b" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(positionController.deletePosition, req, res);

    expect(deleteSpy).toHaveBeenCalledWith("p-org-b", "org-a");
    expect(res.statusCode).toBe(404);
  });

  test("returns 401 when unauthenticated", async () => {
    const repoSpy = spyOn(positionRepo, "deletePosition");
    const req = createRequest({
      user: undefined,
      params: { id: "p1" } as Request["params"],
    });
    const res = createMockResponse();

    await callController(positionController.deletePosition, req, res);

    expect(repoSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
