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
  created_at: string;
  archived: boolean;
  deleted: boolean;
  list_id: string;
  completed: boolean;
  creator_id: string;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  priority: number | null;
  href?: string;
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  created_at: string;
}
