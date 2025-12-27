export interface LinkedTask {
  id: string;
  name: string;
  completed_at: string | null;
  priority: string | null;
  listName: string | null;
}

export interface TaskProject {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  health_status: string | null;
  lead_id: string | null;
  lead?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  creator_id: string;
  creator?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  tasksCount: number;
  completedTasksCount: number;
  linkedTasks: LinkedTask[];
}

export interface TaskProjectsClientProps {
  wsId: string;
  initialProjects: TaskProject[];
}

export interface TaskOption {
  id: string;
  name: string;
  completed_at: string | null;
  listName: string | null;
}

export type ViewMode = 'grid' | 'list';
export type SortBy =
  | 'created_at'
  | 'name'
  | 'status'
  | 'priority'
  | 'health_status'
  | 'tasks_count';
export type SortOrder = 'asc' | 'desc';
