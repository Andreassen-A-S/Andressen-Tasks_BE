import { afterEach, describe, expect, mock, test } from "bun:test";

const saFindUniqueMock = mock<(...args: any[]) => Promise<any>>();
const saUpdateMock = mock<(...args: any[]) => Promise<any>>();
const saCountMock = mock<(...args: any[]) => Promise<any>>();
const sessionUpdateMock = mock<(...args: any[]) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    sessionAccount: {
      findUnique: saFindUniqueMock,
      update: saUpdateMock,
      updateMany: mock(),
      upsert: mock(),
      findMany: mock(),
      count: saCountMock,
    },
    session: {
      create: mock(),
      findUnique: mock(),
      update: sessionUpdateMock,
    },
    $transaction: mock(async (ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops({}),
    ),
  },
}));

mock.module("../src/repositories/userRepository", () => ({
  signUserProfilePicture: mock((u: any) => u),
  isUserProfilePicturePath: mock(() => false),
}));

const sessionRepo = await import("../src/repositories/sessionRepository");

afterEach(() => {
  mock.restore();
  for (const m of [saFindUniqueMock, saUpdateMock, saCountMock, sessionUpdateMock]) {
    m.mockReset();
  }
});

describe("revokeSessionAccountAndMaybeSession", () => {
  test("does nothing when account not found", async () => {
    saFindUniqueMock.mockResolvedValueOnce(null);

    await sessionRepo.revokeSessionAccountAndMaybeSession("sa-missing");

    expect(saUpdateMock).not.toHaveBeenCalled();
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });

  test("does nothing when account is already revoked", async () => {
    saFindUniqueMock.mockResolvedValueOnce({ session_id: "s1", revoked_at: new Date() });

    await sessionRepo.revokeSessionAccountAndMaybeSession("sa1");

    expect(saUpdateMock).not.toHaveBeenCalled();
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });

  test("revokes account but not session when other active accounts remain", async () => {
    saFindUniqueMock.mockResolvedValueOnce({ session_id: "s1", revoked_at: null });
    saUpdateMock.mockResolvedValueOnce(undefined);
    saCountMock.mockResolvedValueOnce(1); // one active account remains

    await sessionRepo.revokeSessionAccountAndMaybeSession("sa1");

    expect(saUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session_account_id: "sa1" }, data: { revoked_at: expect.any(Date) } }),
    );
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });

  test("revokes account and session when it was the last active account", async () => {
    saFindUniqueMock.mockResolvedValueOnce({ session_id: "s1", revoked_at: null });
    saUpdateMock.mockResolvedValueOnce(undefined);
    saCountMock.mockResolvedValueOnce(0); // no active accounts remain
    sessionUpdateMock.mockResolvedValueOnce(undefined);

    await sessionRepo.revokeSessionAccountAndMaybeSession("sa1");

    expect(saUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session_account_id: "sa1" } }),
    );
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session_id: "s1" },
        data: { revoked_at: expect.any(Date) },
      }),
    );
  });
});
