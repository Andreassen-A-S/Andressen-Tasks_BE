import { afterEach, describe, expect, mock, test } from "bun:test";
import { UserStatus } from "../src/generated/prisma/client";

const rtFindUniqueMock = mock<(...args: any[]) => Promise<any>>();
const rtUpdateManyMock = mock<(...args: any[]) => Promise<any>>();
const rtCreateMock = mock<(...args: any[]) => Promise<any>>();
const saUpdateManyMock = mock<(...args: any[]) => Promise<any>>();
const saUpdateMock = mock<(...args: any[]) => Promise<any>>();
const sessionUpdateMock = mock<(...args: any[]) => Promise<any>>();
const transactionMock = mock<(...args: any[]) => Promise<any>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    refreshToken: {
      findUnique: rtFindUniqueMock,
      updateMany: rtUpdateManyMock,
      create: rtCreateMock,
    },
    sessionAccount: {
      updateMany: saUpdateManyMock,
      update: saUpdateMock,
    },
    session: { update: sessionUpdateMock },
    $transaction: transactionMock,
  },
}));

mock.module("../src/utils/tokenUtils", () => ({
  hashToken: mock((raw: string) => `hashed:${raw}`),
  generateRawRefreshToken: mock(() => "new-raw"),
  generateAccessToken: mock(() => "mock-access-token"),
}));

const repo = await import("../src/repositories/refreshTokenRepository");

const FUTURE = new Date(Date.now() + 86400_000);

const baseToken = {
  token_id: "t1",
  session_account_id: "sa1",
  token_hash: "hashed:old-raw",
  family_id: "fam1",
  parent_token_id: null,
  created_at: new Date(),
  expires_at: FUTURE,
  used_at: null,
  revoked_at: null,
  session_account: {
    session_account_id: "sa1",
    revoked_at: null,
    user: {
      user_id: "u1", role: "USER", email: "a@b.com",
      name: "Test", organization_id: "org1", status: UserStatus.ACTIVE,
    },
    session: { session_id: "s1", revoked_at: null, expires_at: FUTURE },
  },
};

function makeTx(consumeCount = 1) {
  const txRtUpdateMany = mock<(...args: any[]) => Promise<any>>()
    .mockResolvedValueOnce({ count: consumeCount }) // consume attempt
    .mockResolvedValue({ count: 1 });               // any subsequent calls (family revoke)
  const txSaUpdateMany = mock<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 });
  return {
    tx: {
      refreshToken: { updateMany: txRtUpdateMany, create: rtCreateMock },
      sessionAccount: { updateMany: txSaUpdateMany, update: saUpdateMock },
      session: { update: sessionUpdateMock },
    },
    txRtUpdateMany,
    txSaUpdateMany,
  };
}

afterEach(() => {
  mock.restore();
  for (const m of [rtFindUniqueMock, rtUpdateManyMock, rtCreateMock, saUpdateManyMock,
                   saUpdateMock, sessionUpdateMock, transactionMock]) {
    m.mockReset();
  }
});

describe("rotateRefreshToken — token not found", () => {
  test("returns null", async () => {
    rtFindUniqueMock.mockResolvedValueOnce(null);
    expect(await repo.rotateRefreshToken("old-raw")).toBeNull();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("rotateRefreshToken — pre-check replay (used_at set)", () => {
  test("returns null and revokes family + session account via batch transaction", async () => {
    rtFindUniqueMock.mockResolvedValueOnce({ ...baseToken, used_at: new Date() });
    rtUpdateManyMock.mockResolvedValue({ count: 1 });
    saUpdateManyMock.mockResolvedValue({ count: 1 });
    transactionMock.mockResolvedValueOnce([undefined, undefined]);

    const result = await repo.rotateRefreshToken("old-raw");

    expect(result).toBeNull();

    // Family revocation
    expect(rtUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { family_id: "fam1" } }),
    );
    // Session account revocation
    expect(saUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session_account_id: "sa1", revoked_at: null } }),
    );
  });
});

describe("rotateRefreshToken — concurrent race (count = 0 inside transaction)", () => {
  test("returns null and revokes family + session account inside the transaction", async () => {
    rtFindUniqueMock.mockResolvedValueOnce({ ...baseToken });
    const { tx, txRtUpdateMany, txSaUpdateMany } = makeTx(0);
    transactionMock.mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await repo.rotateRefreshToken("old-raw");

    expect(result).toBeNull();

    // First call: consume attempt (count=0)
    expect(txRtUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token_id: "t1", used_at: null, revoked_at: null },
      }),
    );
    // Second call: family revocation
    expect(txRtUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { family_id: "fam1" } }),
    );
    // Session account revocation
    expect(txSaUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session_account_id: "sa1", revoked_at: null } }),
    );
  });
});

describe("rotateRefreshToken — success", () => {
  test("creates replacement token, updates last_used_at and extends session", async () => {
    rtFindUniqueMock.mockResolvedValueOnce({ ...baseToken });
    rtCreateMock.mockResolvedValueOnce({ token_id: "t2" });
    saUpdateMock.mockResolvedValueOnce(undefined);
    sessionUpdateMock.mockResolvedValueOnce(undefined);

    const { tx, txRtUpdateMany } = makeTx(1);
    transactionMock.mockImplementationOnce(async (fn: any) => fn(tx));

    const result = await repo.rotateRefreshToken("old-raw");

    expect(result).not.toBeNull();
    expect(result?.newRaw).toBe("new-raw");
    expect(result?.user.user_id).toBe("u1");

    // Only one updateMany call: the successful consume
    expect(txRtUpdateMany).toHaveBeenCalledTimes(1);
    expect(txRtUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token_id: "t1", used_at: null, revoked_at: null },
      }),
    );

    // Session extended
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session_id: "s1" },
        data: { expires_at: expect.any(Date) },
      }),
    );
  });
});
