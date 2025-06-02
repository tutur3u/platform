export interface TaskBoard {
  id: string;
  name: string;
  archived: boolean;
  deleted: boolean;
  created_at: string;
  creator_id: string;
  ws_id: string;
  href?: string;
}

export interface TaskList {
  id: string;
  name: string;
  archived: boolean;
  deleted: boolean;
  created_at: string;
  board_id: string;
  creator_id: string;
  href?: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  list_id: string;
  priority?: number | null;
  start_date?: string;
  end_date?: string;
  archived: boolean;
  created_at: string;
  assignees?: {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    handle?: string;
  }[];
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  created_at: string;
}
