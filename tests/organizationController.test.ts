import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Request, Response } from "express";
import * as orgController from "../src/controllers/organizationController";
import * as orgRepo from "../src/repositories/organizationRepository";
import * as storageService from "../src/services/storageService";
import { MESTERPLAN_ORG_ID } from "../src/constants";

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

describe("organizationController.listOrganizations", () => {
  test("returns organizations", async () => {
    const organizations = [{ org_id: "org1", name: "Org 1" }];
    spyOn(orgRepo, "getAllOrganizations").mockResolvedValue(organizations as never);
    const res = createMockResponse();

    await orgController.listOrganizations(createRequest(), res);

    expect(res.body).toEqual({ success: true, data: organizations });
  });
});

describe("organizationController.createOrganization", () => {
  test("creates organization with trimmed fields", async () => {
    const organization = { org_id: "org1", name: "Org 1", slug: "org-1" };
    const createSpy = spyOn(orgRepo, "createOrganization").mockResolvedValue(organization as never);
    const req = createRequest({ body: { name: " Org 1 ", slug: " org-1 " } });
    const res = createMockResponse();

    await orgController.createOrganization(req, res);

    expect(createSpy).toHaveBeenCalledWith({ name: "Org 1", slug: "org-1", logo_url: undefined });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, data: organization });
  });


});

describe("organizationController.updateOrganization", () => {

  test("updates organization with trimmed fields", async () => {
    const organization = { org_id: "org1", name: "Org 1", slug: "org-1" };
    const updateSpy = spyOn(orgRepo, "updateOrganization").mockResolvedValue(organization as never);
    const req = createRequest({
      params: { id: "org1" },
      user: { role: "SUPER_ADMIN" },
      body: { name: " Org 1 ", slug: " org-1 ", logo_url: null },
    });
    const res = createMockResponse();

    await orgController.updateOrganization(req, res);

    expect(updateSpy).toHaveBeenCalledWith("org1", { name: "Org 1", slug: "org-1", logo_url: null });
    expect(res.body).toEqual({ success: true, data: organization });
  });


  test("returns 403 when admin updates slug", async () => {
    const updateSpy = spyOn(orgRepo, "updateOrganization");
    const req = createRequest({
      params: { id: "org1" },
      user: { role: "ADMIN" },
      body: { slug: "new-slug" },
    });
    const res = createMockResponse();

    await orgController.updateOrganization(req, res);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe("organizationController.prepareOrgLogo", () => {

  test("returns 404 when organization does not exist", async () => {
    const uploadSpy = spyOn(storageService, "generateOrgLogoUploadUrl");
    spyOn(orgRepo, "getOrganizationById").mockResolvedValue(null);
    const req = createRequest({ params: { id: "org1" }, body: { mime_type: "image/png" } });
    const res = createMockResponse();

    await orgController.prepareOrgLogo(req, res);

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  test("returns upload data for existing organization", async () => {
    const uploadData = { uploadUrl: "https://upload.test", gcsPath: "organizations/org1/logo.webp" };
    spyOn(orgRepo, "getOrganizationById").mockResolvedValue({ org_id: "org1" } as never);
    const uploadSpy = spyOn(storageService, "generateOrgLogoUploadUrl").mockResolvedValue(uploadData);
    const req = createRequest({ params: { id: "org1" }, body: { mime_type: "image/png" } });
    const res = createMockResponse();

    await orgController.prepareOrgLogo(req, res);

    expect(uploadSpy).toHaveBeenCalledWith("org1", "image/png");
    expect(res.body).toEqual({ success: true, data: uploadData });
  });
});

describe("organizationController.deleteOrganization", () => {
  test("does not delete MesterPlan organization", async () => {
    const deleteSpy = spyOn(orgRepo, "deleteOrganization");
    const req = createRequest({ params: { id: MESTERPLAN_ORG_ID } });
    const res = createMockResponse();

    await orgController.deleteOrganization(req, res);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: "This organization cannot be deleted" });
  });

  test("deletes organization with no content response", async () => {
    const deleteSpy = spyOn(orgRepo, "deleteOrganization").mockResolvedValue(undefined as never);
    const req = createRequest({ params: { id: "org1" } });
    const res = createMockResponse();
    res.send = mock(() => res) as unknown as Response["send"];

    await orgController.deleteOrganization(req, res);

    expect(deleteSpy).toHaveBeenCalledWith("org1");
    expect(res.statusCode).toBe(204);
  });
});
