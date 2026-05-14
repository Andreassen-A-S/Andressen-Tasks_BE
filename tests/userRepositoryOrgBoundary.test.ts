import { afterEach, describe, expect, mock, test } from "bun:test";
import { UserRole } from "../src/generated/prisma/client";

const userFindFirstMock = mock<(...args: any[]) => Promise<any>>();
const userUpdateMock = mock<(...args: any[]) => Promise<any>>();
const userDeleteManyMock = mock<(...args: any[]) => Promise<{ count: number }>>();

mock.module("../src/db/prisma", () => ({
  prisma: {
    user: {
      findFirst: userFindFirstMock,
      update: userUpdateMock,
      deleteMany: userDeleteManyMock,
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
  userDeleteManyMock.mockReset();
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

  test("deleteUserInOrg scopes deletion by effective org", async () => {
    userDeleteManyMock.mockResolvedValue({ count: 1 });

    await userRepo.deleteUserInOrg("user-a", "org-a");

    expect(userDeleteManyMock).toHaveBeenCalledWith({
      where: {
        user_id: "user-a",
        role: { not: UserRole.SYSTEM },
        organization_id: "org-a",
      },
    });
  });

  test("deleteUserInOrg rejects users outside scoped org", async () => {
    userDeleteManyMock.mockResolvedValue({ count: 0 });

    await expect(userRepo.deleteUserInOrg("user-b", "org-a")).rejects.toThrow("User not found: user-b");
  });
});
