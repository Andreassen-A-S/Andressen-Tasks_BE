export const notificationMessages = {
  TASK_ASSIGNED: (taskTitle: string) => ({
    title: "Ny opgave",
    subtitle: taskTitle,
    body: "Du er blevet tildelt opgaven",
  }),

  TASK_COMPLETED: (taskTitle: string, actor: string) => ({
    title: actor,
    subtitle: taskTitle,
    body: "Markerede opgaven som færdig",
  }),

  TASK_PRIORITY_CHANGED: (taskTitle: string) => ({
    title: "Høj prioritet",
    subtitle: taskTitle,
    body: "Opgaven er markeret som høj prioritet",
  }),

  PROGRESS_LOGGED: (
    taskTitle: string,
    actor: string,
    progress: number,
    unit: string,
  ) => ({
    title: actor,
    subtitle: `Registrerede fremgang på ${taskTitle}`,
    body: `${progress} ${unit}`,
  }),

  COMMENT_REPLY: (
    taskTitle: string,
    commentPreview: string,
    actor: string,
  ) => ({
    title: `${actor}`,
    subtitle: `Til ${taskTitle}`,
    body: `Har svaret: ${commentPreview}`,
  }),

  COMMENT_MENTION: (
    taskTitle: string,
    commentPreview: string,
    actor: string,
  ) => ({
    title: `${actor}`,
    subtitle: `Til ${taskTitle}`,
    body: `📣 • ${commentPreview}`,
  }),

  // Maybe merge COMMENT_ON_ASSIGNED_TASK and COMMENT_NEW into one, since they are very similar
  COMMENT_ON_ASSIGNED_TASK: (
    taskTitle: string,
    commentPreview: string,
    actor: string,
  ) => ({
    title: `${actor}`,
    subtitle: `Til ${taskTitle}`,
    body: `${commentPreview}`,
  }),

  COMMENT_NEW: (taskTitle: string, commentPreview: string, actor: string) => ({
    title: `${actor}`,
    subtitle: `Til ${taskTitle}`,
    body: `${commentPreview}`,
  }),

  MORNING_TASKS: (count: number) => ({
    title: `${count} opgave${count > 1 ? "r" : ""} i dag`,
    body: "Tryk for at se dagens program",
  }),

  NO_ACTIVITY: () => ({
    title: "Husk at logge fremgang",
    body: "Opdater dine opgaver, hvis der er sket noget i dag",
  }),
} as const;
