import type { QueryClient } from '@tanstack/react-query';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';

export interface WorkspaceProject {
  id: string;
  name: string;
  status: string | null;
}

export interface WorkspaceMember {
  id: string;
  user_id?: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

export interface BulkOperationsConfig {
  queryClient: QueryClient;
  wsId: string;
  boardId: string;
  selectedTasks: Set<string>;
  columns: TaskList[];
  workspaceLabels?: WorkspaceLabel[];
  workspaceProjects?: WorkspaceProject[];
  workspaceMembers?: WorkspaceMember[];
  weekStartsOn?: 0 | 1 | 6;
  setBulkWorking: (working: boolean) => void;
  clearSelection: () => void;
  setBulkDeleteOpen: (open: boolean) => void;
  broadcast?: BoardBroadcastFn | null;
}
