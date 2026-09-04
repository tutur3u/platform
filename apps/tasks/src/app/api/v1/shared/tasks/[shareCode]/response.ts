import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

export type SharedTaskRecord = Task & {
  assignees: NonNullable<Task['assignees']>;
  labels: NonNullable<Task['labels']>;
  projects: NonNullable<Task['projects']>;
};

interface SharedTaskResponseBase {
  task: SharedTaskRecord;
  workspace: { id: string; name: string };
  board: { id: string; name: string };
  list: { id: string; name: string };
}

export interface SharedTaskViewResponse extends SharedTaskResponseBase {
  permission: 'view';
}

export interface SharedTaskEditResponse extends SharedTaskResponseBase {
  permission: 'edit';
  boardConfig: {
    id: string;
    name?: string;
    ws_id: string;
    ticket_prefix?: string;
    estimation_type?: string;
    extended_estimation?: boolean;
    allow_zero_estimates?: boolean;
  };
  availableLists: TaskList[];
  workspaceLabels: Array<{
    id: string;
    name: string;
    color: string;
    created_at: string;
  }>;
  workspaceProjects: Array<{ id: string; name: string; status: string }>;
  workspaceMembers: Array<{
    id: string;
    user_id: string;
    display_name: string;
    avatar_url?: string | null;
  }>;
}

export type SharedTaskResponse =
  | SharedTaskViewResponse
  | SharedTaskEditResponse;
