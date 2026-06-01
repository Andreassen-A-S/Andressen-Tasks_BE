import { UserRole } from "../generated/prisma/client";
import { TaskForbiddenError } from "../errors/domainErrors";
import type { RequestContext } from "../types/requestContext";

export function assertCanMutateTask(
  ctx: RequestContext,
  task: { created_by: string; assigned_users: string[] },
): void {
  const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
  if (!isAdmin && task.created_by !== ctx.actorUserId && !task.assigned_users.includes(ctx.actorUserId)) {
    throw new TaskForbiddenError();
  }
}
