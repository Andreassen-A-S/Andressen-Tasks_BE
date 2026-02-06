import { UserRole } from "../generated/prisma/client";

declare module "express" {
  interface Request {
    user?: {
      user_id: string;
      email: string;
      role: UserRole;
      name: string | null;
    };
  }
}
