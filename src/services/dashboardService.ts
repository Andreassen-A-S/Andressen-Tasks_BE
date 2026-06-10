import * as taskRepo from "../repositories/taskRepository";
import * as projectRepo from "../repositories/projectRepository";
import * as assignmentRepo from "../repositories/assignmentRepository";
import * as commentRepo from "../repositories/commentRepository";
import { generateSignedReadUrl } from "./storageService";
import { UserRole } from "../generated/prisma/client";
import { DashboardForbiddenError } from "../errors/domainErrors";
import type { RequestContext } from "../types/requestContext";

export async function getDashboardData(ctx: RequestContext) {
  if (!ctx.effectiveOrgId) return null;

  const isAdmin = ctx.isSuperAdmin || ctx.actorRole === UserRole.ADMIN;
  if (!isAdmin) throw new DashboardForbiddenError();
  const orgId = ctx.effectiveOrgId;

  const [tasks, projects, assignments, todayComments] = await Promise.all([
    taskRepo.getAllTasks(orgId),
    projectRepo.getAllProjects(orgId),
    assignmentRepo.getAllAssignments(orgId),
    commentRepo.getTodayCommentsByOrg(orgId),
  ]);

  const todayCommentsWithUrls = await Promise.all(
    todayComments.map(async (comment) => ({
      ...comment,
      attachments: await Promise.all(
        comment.attachments.map(async (att: any) => ({
          ...att,
          url: await generateSignedReadUrl(att.gcs_path),
        })),
      ),
    })),
  );

  return { tasks, projects, assignments, todayComments: todayCommentsWithUrls };
}
