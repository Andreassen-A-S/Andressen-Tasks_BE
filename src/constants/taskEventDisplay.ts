import { TaskEventType } from "../generated/prisma/client";

export type TaskEventDisplayTarget = "timeline" | "inline" | "audit";

export const taskEventDisplay: Record<TaskEventType, TaskEventDisplayTarget> = {
  [TaskEventType.TASK_CREATED]:                  "timeline",
  [TaskEventType.TASK_TITLE_CHANGED]:             "timeline",
  [TaskEventType.TASK_DESCRIPTION_CHANGED]:       "inline",
  [TaskEventType.TASK_DUE_DATE_CHANGED]:          "timeline",
  [TaskEventType.TASK_PRIORITY_CHANGED]:          "timeline",
  [TaskEventType.TASK_PROJECT_CHANGED]:           "timeline",
  [TaskEventType.TASK_STATUS_CHANGED]:            "timeline",
  [TaskEventType.TASK_DELETED]:                   "audit",
  [TaskEventType.ASSIGNMENT_CREATED]:             "timeline",
  [TaskEventType.ASSIGNMENT_DELETED]:             "timeline",
  [TaskEventType.COMMENT_CREATED]:                "timeline",
  [TaskEventType.COMMENT_UPDATED]:                "inline",
  [TaskEventType.COMMENT_DELETED]:                "timeline",
  [TaskEventType.PROGRESS_LOGGED]:                "timeline",
  [TaskEventType.SUBTASK_ADDED]:                  "timeline",
  [TaskEventType.SUBTASK_REMOVED]:                "timeline",
  [TaskEventType.RECURRING_TEMPLATE_CREATED]:     "audit",
  [TaskEventType.RECURRING_TEMPLATE_UPDATED]:     "audit",
  [TaskEventType.RECURRING_TEMPLATE_DEACTIVATED]: "audit",
  [TaskEventType.RECURRING_INSTANCE_GENERATED]:   "timeline",
};
