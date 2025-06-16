import type { WorkspaceTask } from '@tuturuuu/types/db';

export interface ExtendedWorkspaceTask extends Partial<WorkspaceTask> {
  board_name?: string;
  list_name?: string;
  assignees?: Array<{
    id: string;
    display_name?: string;
    avatar_url?: string;
    email?: string;
  }>;
  is_assigned_to_current_user?: boolean;
}

export interface TaskFilters {
  priority: string;
  status: string;
  board: string;
  list: string;
  assignee: string;
}

export interface TaskSidebarFilters {
  board: string;
  list: string;
  assignee: string;
}
