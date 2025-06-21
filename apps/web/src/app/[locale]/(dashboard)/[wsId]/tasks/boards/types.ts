import { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';

export interface BoardStats {
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  overdueTasks: number;
  completionRate: number;
  priorityDistribution: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  statusDistribution: {
    not_started: number;
    active: number;
    done: number;
    closed: number;
  };
  totalLists: number;
  lastActivity: string;
  // New stats for workload analysis
  assigneeWorkload: {
    userId: string;
    name: string;
    taskCount: number;
    isOverloaded: boolean;
  }[];
  hasUrgentTasks: boolean;
  hasMultipleOverdue: boolean;
  hasWorkloadImbalance: boolean;
}

export interface EnhancedBoard extends TaskBoard {
  href: string;
  stats: BoardStats;
  groupId?: string; // For group assignment instead of department
  color?: string; // Board color theme
}

export interface BoardGroup {
  id: string;
  name: string;
  boards: EnhancedBoard[];
  color: string;
  order: number;
}

export type ViewMode = 'table' | 'cards' | 'groups';
export type SortField = 'name' | 'id' | 'created_at' | 'progress' | 'tasks' | 'group';
export type SortDirection = 'asc' | 'desc';

export interface SmartFilters {
  hasUrgentTasks: boolean;
  hasMultipleOverdue: boolean;
  hasWorkloadImbalance: boolean;
}

export interface ViewSettings {
  viewMode: ViewMode;
  sortBy: SortField;
  sortOrder: SortDirection;
  forceShowAll: boolean; // Override smart detection
  visibleColumns?: string[]; // For table mode column visibility
  groupView?: {
    collapsed: string[]; // Group IDs that are collapsed
  };
  pagination?: {
    page: number;
    pageSize: number;
  };
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  viewMode: 'cards',
  sortBy: 'name',
  sortOrder: 'asc',
  forceShowAll: false,
  visibleColumns: ['board', 'progress', 'tasks', 'status', 'last_updated', 'actions'],
  groupView: {
    collapsed: []
  },
  pagination: {
    page: 1,
    pageSize: 5
  }
};

export const STORAGE_KEYS = {
  VIEW_SETTINGS: 'task_boards_view_settings'
} as const;

// Predefined group colors
export const GROUP_COLORS = {
  'Gaming': '#10b981', // emerald
  'Robotics': '#3b82f6', // blue
  'Marketing': '#f59e0b', // amber
  'Development': '#8b5cf6', // violet
  'Design': '#ec4899', // pink
  'Research': '#06b6d4', // cyan
  'Sales': '#84cc16', // lime
  'Support': '#f97316', // orange
  'Finance': '#6366f1', // indigo
  'HR': '#14b8a6', // teal
  'Operations': '#ef4444', // red
  'Strategy': '#64748b', // slate
  'Default': '#6b7280' // gray
} as const; 