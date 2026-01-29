import type { TaskPriority } from "./taskPriority";
import type { TaskStatus } from "./taskStatus";

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date;
}
