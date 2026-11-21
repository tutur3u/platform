import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

export interface WorkspaceTaskFleetFields {
  virtual_assignees?: { key: string; kind: 'agent'; position: number }[] | null;
  needs_user?: boolean | null;
  needs_user_reason?: string | null;
  task_resources?: { kind: 'link'; url: string; title?: string }[] | null;
}

export interface WorkspaceTaskUpdatePayload extends WorkspaceTaskFleetFields {
  name?: string;
  description?: string | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  end_date?: string | null;
  closed_at?: string | null;
  completed_at?: string | null;
  list_id?: string;
  estimation_points?: number | null;
  label_ids?: string[];
  assignee_ids?: string[];
  project_ids?: string[];
  completed?: boolean;
  deleted?: boolean;
  sort_key?: number;
}
