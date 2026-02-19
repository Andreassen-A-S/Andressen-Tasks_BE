import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { UserRole } from "../src/generated/prisma/client";
import * as statController from "../src/controllers/statController";
import { StatsService } from "../src/services/statService";

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

  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("statController.getMyStats", () => {
  test("returns 401 when user is missing", async () => {
    const getUserStatsSpy = spyOn(StatsService.prototype, "getUserStats");
    const req = createRequest({ user: undefined });
    const res = createMockResponse();

    await statController.getMyStats(req, res);

    expect(getUserStatsSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });

  test("returns current user stats including weekly stats", async () => {
    const stats = {
      user_id: "u1",
      assigned_tasks: 10,
      completed_tasks: 5,
      overdue_tasks: 1,
      completion_rate: 50,
      weekly_stats: {
        assigned_tasks: 3,
        completed_tasks: 2,
        completion_rate: 67,
      },
    };

    const getUserStatsSpy = spyOn(
      StatsService.prototype,
      "getUserStats",
    ).mockResolvedValue(stats as never);

    const req = createRequest({ user: { user_id: "u1", role: UserRole.USER } });
    const res = createMockResponse();

    await statController.getMyStats(req, res);

    expect(getUserStatsSpy).toHaveBeenCalledWith("u1");
    expect(res.body).toEqual({ success: true, data: stats });
  });
});

describe("statController.getUserStats", () => {
  test("returns 403 when non-admin requests another user", async () => {
    const getUserStatsSpy = spyOn(StatsService.prototype, "getUserStats");

    const req = createRequest({
      user: { user_id: "u1", role: UserRole.USER },
      params: { userId: "u2" } as Request["params"],
    });
    const res = createMockResponse();

    await statController.getUserStats(req, res);

    expect(getUserStatsSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: "Not authorized to view other users' stats",
    });
  });

  test("allows admin to request another user", async () => {
    const stats = {
      user_id: "u2",
      assigned_tasks: 8,
      completed_tasks: 6,
      overdue_tasks: 0,
      completion_rate: 75,
      weekly_stats: {
        assigned_tasks: 2,
        completed_tasks: 2,
        completion_rate: 100,
      },
    };

    const getUserStatsSpy = spyOn(
      StatsService.prototype,
      "getUserStats",
    ).mockResolvedValue(stats as never);

    const req = createRequest({
      user: { user_id: "admin", role: UserRole.ADMIN },
      params: { userId: "u2" } as Request["params"],
    });
    const res = createMockResponse();

    await statController.getUserStats(req, res);

    expect(getUserStatsSpy).toHaveBeenCalledWith("u2");
    expect(res.body).toEqual({ success: true, data: stats });
  });
});

describe("statController.getTopPerformers", () => {
  test("returns 400 for invalid limit", async () => {
    spyOn(StatsService.prototype, "getTopPerformers").mockRejectedValue(
      new Error("Limit must be between 1 and 20"),
    );

    const req = createRequest({ query: { limit: "200" } as Request["query"] });
    const res = createMockResponse();

    await statController.getTopPerformers(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "Limit must be between 1 and 20",
    });
  });
});
