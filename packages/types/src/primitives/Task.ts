import type { TaskPriority } from './Priority';

export interface Task {
  id: string;
  name: string;
  description?: string;
  list_id: string;
  priority?: TaskPriority | null;
  start_date?: string;
  end_date?: string | null;
  archived: boolean;
  deleted?: boolean;
  created_at: string;
  estimation_points?: number | null;
  sort_key?: number | null;
  labels?: {
    id: string;
    name: string;
    color: string;
    created_at: string;
  }[];
  assignees?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    handle?: string;
  }[];
  projects?: {
    id: string;
    name: string;
    status: string;
  }[];
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  created_at: string;
}

export interface GanttTask extends Task {
  boardId: string;
  boardName: string;
  listName: string;
  listStatus?: string;
  updated_at?: string;
  status?: string;
  [key: string]: unknown;
}
