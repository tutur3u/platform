export const TaskPriorities = ['critical', 'high', 'normal', 'low'] as const;
export type TaskPriority = (typeof TaskPriorities)[number];
