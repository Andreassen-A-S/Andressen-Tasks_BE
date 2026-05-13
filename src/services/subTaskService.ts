import { prisma } from "../db/prisma";
import { TaskEventType, TaskStatus } from "../generated/prisma/client";
import * as taskRepo from "../repositories/taskRepository";
import * as taskEventRepo from "../repositories/taskEventRepository";
import type { RequestContext } from "../types/requestContext";
import { TaskArchivedError, TaskNotFoundError } from "../errors/domainErrors";

export { TaskArchivedError, TaskNotFoundError };

// Creates a subtask under the given parent task.
// The parent task must exist and must not be archived.
// The subtask inherits the parent's project_id if one is not explicitly provided.
export async function createSubtask(
  ctx: RequestContext,
  parentTaskId: string,
  subtaskData: Record<string, unknown>,
) {
  const parentTask = await taskRepo.getTaskById(parentTaskId, ctx.effectiveOrgId);
  if (!parentTask) throw new TaskNotFoundError(parentTaskId);
  if (parentTask.status === TaskStatus.ARCHIVED) throw new TaskArchivedError();

  const subtask = await prisma.$transaction(async (tx) => {
    const created = await taskRepo.createTaskWithAssignments(
      tx,
      {
        ...subtaskData,
        parent_task_id: parentTaskId,
        project_id: (subtaskData.project_id as string | undefined) ?? parentTask.project_id,
        created_by: ctx.actorUserId,
      } as any,
      ctx.effectiveOrgId,
    );

    if (!created) return null;

    await Promise.all([
      // Event on the parent task to record the new subtask.
      taskEventRepo.createTaskEvent(tx, {
        task: { connect: { task_id: parentTaskId } },
        actor: { connect: { user_id: ctx.actorUserId } },
        type: TaskEventType.SUBTASK_ADDED,
        message: "Subtask created",
        before_json: {},
        after_json: created ?? {},
      }),
      // Event on the subtask itself.
      taskEventRepo.createTaskEvent(tx, {
        task: { connect: { task_id: created.task_id } },
        actor: { connect: { user_id: ctx.actorUserId } },
        type: TaskEventType.TASK_CREATED,
        message: "Task created",
        before_json: {},
        after_json: created ?? {},
      }),
    ]);

    return created;
  });

  return subtask;
}
