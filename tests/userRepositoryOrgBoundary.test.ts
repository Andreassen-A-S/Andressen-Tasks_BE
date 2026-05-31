import { afterEach, describe, expect, mock, test } from "bun:test";
import { UserRole, UserStatus } from "../src/generated/prisma/client";

const userFindFirstMock = mock<(...args: any[]) => Promise<any>>();
const userUpdateMock = mock<(...args: any[]) => Promise<any>>();
const userUpdateManyMock = mock<(...args: any[]) => Promise<{ count: number }>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    user: {
      findFirst: userFindFirstMock,
      update: userUpdateMock,
      updateMany: userUpdateManyMock,
    },
  },
}));

mock.module("../src/helper/helpers", () => ({
  hashPassword: mock((password: string) => Promise.resolve(`hashed:${password}`)),
}));

const userRepo = await import("../src/repositories/userRepository");

afterEach(() => {
  mock.restore();
  userFindFirstMock.mockReset();
  userUpdateMock.mockReset();
  userUpdateManyMock.mockReset();
});

describe("userRepository organization boundaries", () => {
  test("updateUserInOrg scopes admin mutation by effective org", async () => {
    userFindFirstMock.mockResolvedValue({ role: UserRole.USER });
    userUpdateMock.mockResolvedValue({ user_id: "user-a", name: "Updated" });

    await userRepo.updateUserInOrg("user-a", "org-a", { name: "Updated" });

    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { user_id: "user-a", organization_id: "org-a" },
      select: { role: true },
    });
  });

  test("updateUserInOrg rejects users outside scoped org", async () => {
    userFindFirstMock.mockResolvedValue(null);

    await expect(userRepo.updateUserInOrg("user-b", "org-a", { name: "Nope" }))
      .rejects.toThrow("User not found: user-b");

    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  test("deleteUserInOrg scopes termination by effective org", async () => {
    userUpdateManyMock.mockResolvedValue({ count: 1 });

    await userRepo.deleteUserInOrg("user-a", "org-a");

    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: {
        user_id: "user-a",
        role: { not: UserRole.SYSTEM },
        organization_id: "org-a",
      },
      data: {
        status: UserStatus.TERMINATED,
        push_token: null,
      },
    });
  });

  test("deleteUserInOrg rejects users outside scoped org", async () => {
    userUpdateManyMock.mockResolvedValue({ count: 0 });

    await expect(userRepo.deleteUserInOrg("user-b", "org-a")).rejects.toThrow("User not found: user-b");
  });
});
