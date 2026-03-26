import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import * as projectController from "../src/controllers/projectController";
import * as projectRepo from "../src/repositories/projectRepository";
import { ProjectNotFoundError } from "../src/repositories/projectRepository";

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
  return { params: {}, body: {}, ...overrides } as Request;
}

afterEach(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------

describe("projectController.listProjects", () => {
  test("returns all projects", async () => {
    const projects = [{ project_id: "p1", name: "Test" }];
    spyOn(projectRepo, "getAllProjects").mockResolvedValue(projects as never);
    const res = createMockResponse();

    await projectController.listProjects(createRequest(), res);

    expect(res.body).toEqual({ success: true, data: projects });
  });

  test("returns 500 when repository fails", async () => {
    spyOn(projectRepo, "getAllProjects").mockRejectedValue(new Error("db fail"));
    const res = createMockResponse();

    await projectController.listProjects(createRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------

describe("projectController.getProject", () => {
  test("returns project with tasks", async () => {
    const project = { project_id: "p1", name: "Test", tasks: [] };
    spyOn(projectRepo, "getProjectWithTasks").mockResolvedValue(project as never);
    const req = createRequest({ params: { id: "p1" } });
    const res = createMockResponse();

    await projectController.getProject(req, res);

    expect(res.body).toEqual({ success: true, data: project });
  });

  test("returns 404 when project not found", async () => {
    spyOn(projectRepo, "getProjectWithTasks").mockResolvedValue(null as never);
    const req = createRequest({ params: { id: "p1" } });
    const res = createMockResponse();

    await projectController.getProject(req, res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 400 when id is missing", async () => {
    const res = createMockResponse();

    await projectController.getProject(createRequest(), res);

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe("projectController.createProject", () => {
  test("creates project and returns 201", async () => {
    const project = { project_id: "p1", name: "New Project" };
    spyOn(projectRepo, "createProject").mockResolvedValue(project as never);
    const req = createRequest({
      user: { user_id: "u1" },
      body: { name: "New Project" },
    });
    const res = createMockResponse();

    await projectController.createProject(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: project });
  });

  test("returns 400 when name is missing", async () => {
    const req = createRequest({ user: { user_id: "u1" }, body: {} });
    const res = createMockResponse();

    await projectController.createProject(req, res);

    expect(res.statusCode).toBe(400);
  });

  test("returns 400 when name is empty string", async () => {
    const req = createRequest({ user: { user_id: "u1" }, body: { name: "  " } });
    const res = createMockResponse();

    await projectController.createProject(req, res);

    expect(res.statusCode).toBe(400);
  });

  test("returns 401 when unauthenticated", async () => {
    const req = createRequest({ body: { name: "New Project" } });
    const res = createMockResponse();

    await projectController.createProject(req, res);

    expect(res.statusCode).toBe(401);
  });

  test("returns 500 when repository fails", async () => {
    spyOn(projectRepo, "createProject").mockRejectedValue(new Error("db fail"));
    const req = createRequest({
      user: { user_id: "u1" },
      body: { name: "New Project" },
    });
    const res = createMockResponse();

    await projectController.createProject(req, res);

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------

describe("projectController.updateProject", () => {
  test("updates and returns project", async () => {
    const project = { project_id: "p1", name: "Updated" };
    spyOn(projectRepo, "updateProject").mockResolvedValue(project as never);
    const req = createRequest({
      params: { id: "p1" },
      body: { name: "Updated" },
    });
    const res = createMockResponse();

    await projectController.updateProject(req, res);

    expect(res.body).toEqual({ success: true, data: project });
  });

  test("returns 404 when project not found", async () => {
    spyOn(projectRepo, "updateProject").mockRejectedValue(new ProjectNotFoundError("p1"));
    const req = createRequest({ params: { id: "p1" }, body: { name: "x" } });
    const res = createMockResponse();

    await projectController.updateProject(req, res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 400 when id is missing", async () => {
    const res = createMockResponse();

    await projectController.updateProject(createRequest(), res);

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe("projectController.deleteProject", () => {
  test("deletes project and returns success", async () => {
    spyOn(projectRepo, "deleteProject").mockResolvedValue(undefined as never);
    const req = createRequest({ params: { id: "p1" } });
    const res = createMockResponse();

    await projectController.deleteProject(req, res);

    expect(res.body).toEqual({ success: true });
  });

  test("returns 404 when project not found", async () => {
    spyOn(projectRepo, "deleteProject").mockRejectedValue(new ProjectNotFoundError("p1"));
    const req = createRequest({ params: { id: "p1" } });
    const res = createMockResponse();

    await projectController.deleteProject(req, res);

    expect(res.statusCode).toBe(404);
  });

  test("returns 400 when id is missing", async () => {
    const res = createMockResponse();

    await projectController.deleteProject(createRequest(), res);

    expect(res.statusCode).toBe(400);
  });
});
