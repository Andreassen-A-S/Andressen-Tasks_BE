import { afterEach, describe, expect, mock, test } from "bun:test";

const positionFindManyMock = mock<(...args: any[]) => Promise<any>>();
const positionFindFirstMock = mock<(...args: any[]) => Promise<any>>();
const positionCreateMock = mock<(...args: any[]) => Promise<any>>();
const positionUpdateMock = mock<(...args: any[]) => Promise<any>>();
const positionDeleteMock = mock<(...args: any[]) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    position: {
      findMany: positionFindManyMock,
      findFirst: positionFindFirstMock,
      create: positionCreateMock,
      update: positionUpdateMock,
      delete: positionDeleteMock,
    },
  },
}));

const positionRepo = await import("../src/repositories/positionRepository");

afterEach(() => {
  mock.restore();
  positionFindManyMock.mockReset();
  positionFindFirstMock.mockReset();
  positionCreateMock.mockReset();
  positionUpdateMock.mockReset();
  positionDeleteMock.mockReset();
});

describe("positionRepository organization boundaries", () => {
  test("getAllPositions scopes query by org", async () => {
    positionFindManyMock.mockResolvedValue([]);

    await positionRepo.getAllPositions("org-a");

    expect(positionFindManyMock).toHaveBeenCalledWith({
      where: { organization_id: "org-a" },
      orderBy: { name: "asc" },
    });
  });

  test("getAllPositions returns all orgs when orgId is null (superadmin)", async () => {
    positionFindManyMock.mockResolvedValue([]);

    await positionRepo.getAllPositions(null);

    expect(positionFindManyMock).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { name: "asc" },
    });
  });

  test("getPositionById scopes lookup by org", async () => {
    positionFindFirstMock.mockResolvedValue({ position_id: "p1", name: "Murer" });

    await positionRepo.getPositionById("p1", "org-a");

    expect(positionFindFirstMock).toHaveBeenCalledWith({
      where: { position_id: "p1", organization_id: "org-a" },
    });
  });

  test("getPositionById returns null when position belongs to another org", async () => {
    positionFindFirstMock.mockResolvedValue(null);

    const result = await positionRepo.getPositionById("p-org-b", "org-a");

    expect(result).toBeNull();
  });

  test("updatePosition throws PositionNotFoundError when outside org scope", async () => {
    positionFindFirstMock.mockResolvedValue(null);

    await expect(positionRepo.updatePosition("p-org-b", "org-a", "Renamed")).rejects.toThrow(
      "Position not found: p-org-b",
    );

    expect(positionUpdateMock).not.toHaveBeenCalled();
  });

  test("updatePosition scopes lookup by org before updating", async () => {
    positionFindFirstMock.mockResolvedValue({ position_id: "p1" });
    positionUpdateMock.mockResolvedValue({ position_id: "p1", name: "Elektriker" });

    await positionRepo.updatePosition("p1", "org-a", "Elektriker");

    expect(positionFindFirstMock).toHaveBeenCalledWith({
      where: { position_id: "p1", organization_id: "org-a" },
    });
    expect(positionUpdateMock).toHaveBeenCalledWith({
      where: { position_id: "p1" },
      data: { name: "Elektriker" },
    });
  });

  test("deletePosition throws PositionNotFoundError when outside org scope", async () => {
    positionFindFirstMock.mockResolvedValue(null);

    await expect(positionRepo.deletePosition("p-org-b", "org-a")).rejects.toThrow(
      "Position not found: p-org-b",
    );

    expect(positionDeleteMock).not.toHaveBeenCalled();
  });

  test("deletePosition scopes lookup by org before deleting", async () => {
    positionFindFirstMock.mockResolvedValue({ position_id: "p1" });
    positionDeleteMock.mockResolvedValue(undefined);

    await positionRepo.deletePosition("p1", "org-a");

    expect(positionFindFirstMock).toHaveBeenCalledWith({
      where: { position_id: "p1", organization_id: "org-a" },
    });
    expect(positionDeleteMock).toHaveBeenCalledWith({ where: { position_id: "p1" } });
  });
});
