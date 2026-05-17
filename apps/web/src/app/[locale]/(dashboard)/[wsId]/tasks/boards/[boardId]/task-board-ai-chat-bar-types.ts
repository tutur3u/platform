import type { WorkspaceTaskApiTask } from '@tuturuuu/internal-api/tasks';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

export type TaskBoardAiChatBarMode = 'task' | 'chat';

export interface TaskBoardAiChatBarUser {
  id: string;
  avatar_url?: string | null;
  display_name?: string | null;
  email?: string | null;
  full_name?: string | null;
}

export type TaskBoardAiChatBarTask = WorkspaceTaskApiTask;

export type TaskBoardAiChatBarList = TaskList;
