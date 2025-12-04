// Visualization types for voice AI assistant

export type VisualizationType =
  | 'task_list'
  | 'gantt_timeline'
  | 'status_distribution'
  | 'task_detail'
  | 'google_search'
  | 'core_mention';

export interface BaseVisualization {
  id: string;
  type: VisualizationType;
  createdAt: number;
  dismissed: boolean;
  side: 'left' | 'right' | 'center';
}

// Task list visualization - shows a list of tasks with basic info
export interface TaskListVisualization extends BaseVisualization {
  type: 'task_list';
  data: {
    title: string;
    category?: 'overdue' | 'today' | 'upcoming' | 'search_results';
    tasks: Array<{
      id: string;
      name: string;
      priority: string | null;
      priorityLabel: string;
      endDate: string | null;
      completed: boolean;
      assignees?: Array<{ name: string; avatarUrl?: string }>;
    }>;
  };
}

// Timeline visualization - Gantt-style view of tasks
export interface GanttTimelineVisualization extends BaseVisualization {
  type: 'gantt_timeline';
  data: {
    title: string;
    timeRange: { start: string; end: string };
    tasks: Array<{
      id: string;
      name: string;
      startDate: string | null;
      endDate: string | null;
      status: string;
      priority: string | null;
    }>;
  };
}

// Status distribution visualization - chart showing task counts by status
export interface StatusDistributionVisualization extends BaseVisualization {
  type: 'status_distribution';
  data: {
    title: string;
    total: number;
    counts: {
      not_started: number;
      active: number;
      done: number;
      closed: number;
    };
  };
}

// Task detail visualization - full details for a single task
export interface TaskDetailVisualization extends BaseVisualization {
  type: 'task_detail';
  data: {
    id: string;
    name: string;
    description: string | null;
    priority: string | null;
    priorityLabel: string;
    completed: boolean;
    startDate: string | null;
    endDate: string | null;
    createdAt: string;
    board?: string;
    list?: string;
    labels: Array<{ name: string; color: string }>;
    assignees: Array<{ name: string; avatarUrl?: string }>;
  };
}

// Google Search visualization - displays search query and sources
export interface GoogleSearchVisualization extends BaseVisualization {
  type: 'google_search';
  data: {
    query: string;
    results: Array<{
      title: string;
      url: string;
    }>;
    totalResults?: number;
  };
}

// Core mention visualization - prominent center card for key information
export interface CoreMentionVisualization extends BaseVisualization {
  type: 'core_mention';
  data: {
    title: string;
    content: string;
    emphasis?: 'info' | 'warning' | 'success' | 'highlight';
  };
}

// Union type for all visualizations
export type Visualization =
  | TaskListVisualization
  | GanttTimelineVisualization
  | StatusDistributionVisualization
  | TaskDetailVisualization
  | GoogleSearchVisualization
  | CoreMentionVisualization;

// Visualization action types returned from backend
export type VisualizationAction =
  | 'visualize_task_list'
  | 'visualize_timeline'
  | 'visualize_status_breakdown'
  | 'visualize_task_detail'
  | 'visualize_google_search'
  | 'highlight_core_topic'
  | 'dismiss_core_mention'
  | 'dismiss_visualization';

// Tool response shape from backend
export interface VisualizationToolResponse {
  action: VisualizationAction;
  visualization?: Omit<
    Visualization,
    'id' | 'createdAt' | 'dismissed' | 'side'
  >;
  visualizationId?: string; // For dismiss action
  error?: string;
}
