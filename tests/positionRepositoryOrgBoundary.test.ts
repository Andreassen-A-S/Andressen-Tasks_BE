import { afterEach, describe, expect, mock, test } from "bun:test";

const positionFindManyMock = mock<(...args: any[]) => Promise<any>>();
const positionFindFirstMock = mock<(...args: any[]) => Promise<any>>();
const positionCreateMock = mock<(...args: any[]) => Promise<any>>();
const positionDeleteManyMock = mock<(...args: any[]) => Promise<any>>();
const positionUpdateManyMock = mock<(...args: any[]) => Promise<any>>();
const positionFindUniqueOrThrowMock = mock<(...args: any[]) => Promise<any>>();
const transactionMock = mock<(fn: (tx: any) => Promise<any>) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    position: {
      findMany: positionFindManyMock,
      findFirst: positionFindFirstMock,
      create: positionCreateMock,
      deleteMany: positionDeleteManyMock,
    },
    $transaction: transactionMock,
  },
}));

const positionRepo = await import("../src/repositories/positionRepository");

function makeTx() {
  return {
    position: {
      updateMany: positionUpdateManyMock,
      findUniqueOrThrow: positionFindUniqueOrThrowMock,
    },
  };
}

afterEach(() => {
  mock.restore();
  positionFindManyMock.mockReset();
  positionFindFirstMock.mockReset();
  positionCreateMock.mockReset();
  positionDeleteManyMock.mockReset();
  positionUpdateManyMock.mockReset();
  positionFindUniqueOrThrowMock.mockReset();
  transactionMock.mockReset();
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

  test("updatePositionInOrg throws PositionNotFoundError when outside org scope", async () => {
    transactionMock.mockImplementation((fn: any) => fn(makeTx()));
    positionUpdateManyMock.mockResolvedValue({ count: 0 });

    await expect(positionRepo.updatePositionInOrg("p-org-b", "org-a", "Renamed")).rejects.toThrow(
      "Position not found: p-org-b",
    );

    expect(positionUpdateManyMock).toHaveBeenCalledWith({
      where: { position_id: "p-org-b", organization_id: "org-a" },
      data: { name: "Renamed" },
    });
    expect(positionFindUniqueOrThrowMock).not.toHaveBeenCalled();
  });

  test("updatePositionInOrg scopes update by org and returns updated position", async () => {
    transactionMock.mockImplementation((fn: any) => fn(makeTx()));
    positionUpdateManyMock.mockResolvedValue({ count: 1 });
    positionFindUniqueOrThrowMock.mockResolvedValue({ position_id: "p1", name: "Elektriker" });

    const result = await positionRepo.updatePositionInOrg("p1", "org-a", "Elektriker");

    expect(positionUpdateManyMock).toHaveBeenCalledWith({
      where: { position_id: "p1", organization_id: "org-a" },
      data: { name: "Elektriker" },
    });
    expect(positionFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { position_id: "p1" },
    });
    expect(result).toEqual({ position_id: "p1", name: "Elektriker" });
  });

  test("deletePositionInOrg throws PositionNotFoundError when outside org scope", async () => {
    positionDeleteManyMock.mockResolvedValue({ count: 0 });

    await expect(positionRepo.deletePositionInOrg("p-org-b", "org-a")).rejects.toThrow(
      "Position not found: p-org-b",
    );

    expect(positionDeleteManyMock).toHaveBeenCalledWith({
      where: { position_id: "p-org-b", organization_id: "org-a" },
    });
  });

  test("deletePositionInOrg scopes delete by org", async () => {
    positionDeleteManyMock.mockResolvedValue({ count: 1 });

    await positionRepo.deletePositionInOrg("p1", "org-a");

    expect(positionDeleteManyMock).toHaveBeenCalledWith({
      where: { position_id: "p1", organization_id: "org-a" },
    });
  });
});
