import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types';

// Main timer statistics interface
export interface TimerStats {
  /** Duration in seconds */
  todayTime: number;
  /** Duration in seconds */
  weekTime: number;
  /** Duration in seconds */
  monthTime: number;
  streak: number;
  categoryBreakdown?: {
    today: Record<string, number>;
    week: Record<string, number>;
    month: Record<string, number>;
  };
  dailyActivity?: Array<{
    date: string;
    /** Duration in seconds */
    duration: number;
    sessions: number;
  }>;
}

// Session with related data
export interface SessionWithRelations extends TimeTrackingSession {
  category: TimeTrackingCategory | null;
  task: WorkspaceTask | null;
}

// Goal tracking interface
export interface TimeTrackingGoal {
  id: string;
  ws_id: string;
  user_id: string;
  category_id: string | null;
  daily_goal_minutes: number;
  weekly_goal_minutes: number | null;
  is_active: boolean | null;
  category: TimeTrackingCategory | null;
}

// Extended task interface with additional properties
export interface ExtendedWorkspaceTask extends WorkspaceTask {
  due_date?: any;
  board_name?: string;
  list_name?: string;
  assignee_name?: string;
  assignee_avatar?: string;
  is_assigned_to_current_user?: boolean;
  assignees?: Array<{
    id: string;
    display_name?: string;
    avatar_url?: string;
    email?: string;
  }>;
  /** Workspace ID from task_lists -> workspace_boards relation */
  ws_id?: string;
}

// Task filters interface for timer controls
export interface TaskFilters {
  priority: string | null;
  status: string | null;
  board: string | null;
  list: string | null;
  assignee: string | null;
}

// Sidebar task filters
export interface TaskSidebarFilters {
  board: string | undefined;
  list: string | undefined;
  assignee: string | undefined;
}

// Complete time tracker data structure
export interface TimeTrackerData {
  categories: TimeTrackingCategory[];
  runningSession: SessionWithRelations | null;
  recentSessions: SessionWithRelations[] | null;
  goals: TimeTrackingGoal[] | null;
  tasks: ExtendedWorkspaceTask[];
  stats: TimerStats;
}
