import { UserRole } from "../../generated/prisma/client";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      user_id: string;
      email: string;
      role: UserRole;
      name: string | null;
      organization_id: string | null;
    };
    effectiveOrgId: string | null;
  }
}
