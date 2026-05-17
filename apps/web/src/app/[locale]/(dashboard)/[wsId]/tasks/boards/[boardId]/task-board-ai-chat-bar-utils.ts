import type { TaskBoardAiChatBarTask } from './task-board-ai-chat-bar-types';

export function mergeCreatedTasks(
  current: TaskBoardAiChatBarTask[] | undefined,
  tasks: TaskBoardAiChatBarTask[]
) {
  const merged = new Map(
    (current ?? []).map((task) => [task.id, task] as const)
  );

  for (const task of tasks) {
    merged.set(task.id, {
      assignees: [],
      labels: [],
      projects: [],
      ...merged.get(task.id),
      ...task,
    });
  }

  return [...merged.values()];
}
