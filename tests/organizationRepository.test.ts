import { afterEach, describe, expect, mock, test } from "bun:test";

const orgFindUniqueMock = mock<(...args: any[]) => Promise<any>>();
const orgDeleteMock = mock<(...args: any[]) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
    prisma: {
        organization: {
            findUnique: orgFindUniqueMock,
            delete: orgDeleteMock,
        },
    },
}));

mock.module("../src/services/storageService", () => ({
    generateSignedReadUrl: mock((path: string) => Promise.resolve(path)),
}));

const orgRepo = await import("../src/repositories/organizationRepository");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const mockOrg = {
    org_id: ORG_ID,
    name: "Test Org",
    slug: "test-org",
    logo_url: null,
    status: "ACTIVE",
    subscription_status: "TRIALING",
    current_period_end: null,
    created_at: new Date(),
    updated_at: new Date(),
    _count: { users: 2, projects: 1 },
};

afterEach(() => {
    mock.restore();
    orgFindUniqueMock.mockReset();
    orgDeleteMock.mockReset();
});

describe("organizationRepository.deleteOrganization", () => {
    test("calls prisma.organization.delete with the correct org id", async () => {
        orgFindUniqueMock.mockResolvedValue(mockOrg);
        orgDeleteMock.mockResolvedValue(undefined);

        await orgRepo.deleteOrganization(ORG_ID);

        expect(orgDeleteMock).toHaveBeenCalledWith({ where: { org_id: ORG_ID } });
    });

    test("throws OrganizationNotFoundError when org does not exist", async () => {
        orgFindUniqueMock.mockResolvedValue(null);

        await expect(orgRepo.deleteOrganization(ORG_ID)).rejects.toThrow(`Organization not found: ${ORG_ID}`);
        expect(orgDeleteMock).not.toHaveBeenCalled();
    });
});
