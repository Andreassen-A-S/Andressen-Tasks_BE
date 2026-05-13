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
  test("updateUser scopes admin mutation by effective org", async () => {
    userFindFirstMock.mockResolvedValue({ role: UserRole.USER });
    userUpdateMock.mockResolvedValue({ user_id: "user-a", name: "Updated" });

    await userRepo.updateUser("user-a", { name: "Updated" }, "org-a");

    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { user_id: "user-a", organization_id: "org-a" },
      select: { role: true },
    });
  });

  test("updateUser rejects users outside scoped org", async () => {
    userFindFirstMock.mockResolvedValue(null);

    await expect(userRepo.updateUser("user-b", { name: "Nope" }, "org-a"))
      .rejects.toThrow("User not found");

    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  test("deleteUser scopes deletion by effective org", async () => {
    userDeleteManyMock.mockResolvedValue({ count: 1 });

    await userRepo.deleteUser("user-a", "org-a");

    expect(userDeleteManyMock).toHaveBeenCalledWith({
      where: {
        user_id: "user-a",
        role: { not: UserRole.SYSTEM },
        organization_id: "org-a",
      },
    });
  });

  test("deleteUser rejects users outside scoped org", async () => {
    userDeleteManyMock.mockResolvedValue({ count: 0 });

    await expect(userRepo.deleteUser("user-b", "org-a")).rejects.toThrow("User not found");
  });
});
