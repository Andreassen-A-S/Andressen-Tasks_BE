import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import { UserRole } from "../src/generated/prisma/client";
import * as dashboardController from "../src/controllers/dashboardController";
import * as dashboardService from "../src/services/dashboardService";
import * as taskRepo from "../src/repositories/taskRepository";
import * as projectRepo from "../src/repositories/projectRepository";
import * as assignmentRepo from "../src/repositories/assignmentRepository";
import * as commentRepo from "../src/repositories/commentRepository";
import * as storageService from "../src/services/storageService";
import { DashboardForbiddenError } from "../src/errors/domainErrors";
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

  return res;
}

function createRequest(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    effectiveOrgId: null,
    ...overrides,
  } as Request;
}

afterEach(() => {
  mock.restore();
});

describe("dashboardController.getDashboard", () => {
  test("returns 401 when user is missing", async () => {
    const serviceSpy = spyOn(dashboardService, "getDashboardData");
    const req = createRequest({ user: undefined });
    const res = createMockResponse();

    await callController(dashboardController.getDashboard, req, res);

    expect(serviceSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Unauthorized" });
  });

  test("returns 403 when no effective org context is available", async () => {
    spyOn(dashboardService, "getDashboardData").mockResolvedValue(null as never);
    const req = createRequest({
      user: { user_id: "sa1", role: UserRole.SUPER_ADMIN, organization_id: null },
      effectiveOrgId: null,
    });
    const res = createMockResponse();

    await callController(dashboardController.getDashboard, req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "Forbidden" });
  });

  test("returns dashboard data for an admin with org context", async () => {
    const data = { tasks: [], projects: [], assignments: [], todayComments: [] };
    const serviceSpy = spyOn(dashboardService, "getDashboardData").mockResolvedValue(data as never);
    const req = createRequest({
      user: { user_id: "admin1", role: UserRole.ADMIN, organization_id: "org1" },
      effectiveOrgId: "org1",
    });
    const res = createMockResponse();

    await callController(dashboardController.getDashboard, req, res);

    expect(serviceSpy).toHaveBeenCalledWith({
      actorUserId: "admin1",
      actorRole: UserRole.ADMIN,
      actorOrgId: "org1",
      effectiveOrgId: "org1",
      isSuperAdmin: false,
    });
    expect(res.body).toEqual({ success: true, data });
  });
});

describe("dashboardService.getDashboardData", () => {
  test("returns null when effective org context is missing", async () => {
    const tasksSpy = spyOn(taskRepo, "getAllTasks");

    const data = await dashboardService.getDashboardData({
      actorUserId: "sa1",
      actorRole: UserRole.SUPER_ADMIN,
      actorOrgId: null,
      effectiveOrgId: null,
      isSuperAdmin: true,
    });

    expect(data).toBeNull();
    expect(tasksSpy).not.toHaveBeenCalled();
  });

  test("throws DashboardForbiddenError for non-admin users", async () => {
    const tasksSpy = spyOn(taskRepo, "getAllTasks");

    await expect(dashboardService.getDashboardData({
      actorUserId: "u1",
      actorRole: UserRole.USER,
      actorOrgId: "org1",
      effectiveOrgId: "org1",
      isSuperAdmin: false,
    })).rejects.toBeInstanceOf(DashboardForbiddenError);

    expect(tasksSpy).not.toHaveBeenCalled();
  });

  test("fetches org-scoped dashboard data and signs comment attachments", async () => {
    const tasks = [{ task_id: "t1" }];
    const projects = [{ project_id: "p1" }];
    const assignments = [{ assignment_id: "a1", task_id: "t1" }];
    const comments = [{
      comment_id: "c1",
      attachments: [{ attachment_id: "att1", gcs_path: "comments/att1.jpg" }],
    }];

    const taskSpy = spyOn(taskRepo, "getAllTasks").mockResolvedValue(tasks as never);
    const projectSpy = spyOn(projectRepo, "getAllProjects").mockResolvedValue(projects as never);
    const assignmentSpy = spyOn(assignmentRepo, "getAllAssignments").mockResolvedValue(assignments as never);
    const commentSpy = spyOn(commentRepo, "getTodayCommentsByOrg").mockResolvedValue(comments as never);
    const signedUrlSpy = spyOn(storageService, "generateSignedReadUrl").mockResolvedValue("https://signed.example/att1" as never);

    const data = await dashboardService.getDashboardData({
      actorUserId: "admin1",
      actorRole: UserRole.ADMIN,
      actorOrgId: "org1",
      effectiveOrgId: "org1",
      isSuperAdmin: false,
    });

    expect(taskSpy).toHaveBeenCalledWith("org1");
    expect(projectSpy).toHaveBeenCalledWith("org1");
    expect(assignmentSpy).toHaveBeenCalledWith("org1");
    expect(commentSpy).toHaveBeenCalledWith("org1");
    expect(signedUrlSpy).toHaveBeenCalledWith("comments/att1.jpg");
    expect(data).toEqual({
      tasks,
      projects,
      assignments,
      todayComments: [{
        comment_id: "c1",
        attachments: [{
          attachment_id: "att1",
          gcs_path: "comments/att1.jpg",
          url: "https://signed.example/att1",
        }],
      }],
    });
  });
});
