import type { Task } from "../src/types/task";
import { TaskPriority } from "../src/types/taskPriority";
import { TaskStatus } from "../src/types/taskStatus";

export const tasksDummyData: Task[] = [
  {
    id: "1",
    title: "Prepare weekly report",
    description:
      "Collect data from all departments and prepare the weekly report.",
    priority: TaskPriority.HIGH,
    status: TaskStatus.PENDING,
    deadline: new Date("2026-02-02"),
  },
  {
    id: "2",
    title: "Fix login bug",
    description: "Users cannot log in after password reset.",
    priority: TaskPriority.HIGH,
    status: TaskStatus.PENDING,
    deadline: new Date("2026-01-30"),
  },
  {
    id: "3",
    title: "Update task documentation",
    description: "Make sure the task flow is documented for new employees.",
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.DONE,
    deadline: new Date("2026-01-25"),
  },
  {
    id: "4",
    title: "Clean up staging database",
    priority: TaskPriority.LOW,
    status: TaskStatus.PENDING,
    deadline: new Date("2026-02-10"),
  },
  {
    id: "5",
    title: "Review pull request #42",
    description: "Review and approve changes to the task assignment logic.",
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.REJECTED,
    deadline: new Date("2026-01-28"),
  },
  {
    id: "6",
    title: "Plan sprint meeting",
    description: "Schedule and prepare agenda for next sprint planning.",
    priority: TaskPriority.LOW,
    status: TaskStatus.DONE,
    deadline: new Date("2026-01-27"),
  },
];
