export const TaskPriorities = ['critical', 'high', 'normal', 'low'] as const;
export type TaskPriority = (typeof TaskPriorities)[number];

export const isTaskPriority = (v: unknown): v is TaskPriority =>
  typeof v === 'string' && (TaskPriorities as readonly string[]).includes(v);
