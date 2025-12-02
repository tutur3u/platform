import type { TaskPriority } from './Priority';

export type CalendarHoursType =
  | 'work_hours'
  | 'personal_hours'
  | 'meeting_hours';

export interface Task {
  id: string;
  name: string;
  description?: string;
  list_id: string;
  display_number: number;
  priority?: TaskPriority | null;
  start_date?: string;
  end_date?: string | null;
  created_at: string;
  completed_at?: string;
  closed_at?: string;
  deleted_at?: string;
  estimation_points?: number | null;
  sort_key?: number | null;
  // Scheduling fields
  total_duration?: number | null; // Duration in hours
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: CalendarHoursType | null;
  auto_schedule?: boolean | null;
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
  // Calendar events linked to this task
  calendar_events?: {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    scheduled_minutes: number;
    completed: boolean;
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
