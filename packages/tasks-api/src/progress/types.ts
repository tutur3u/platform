export type TaskProgressMetricKind =
  | 'tasks'
  | 'points'
  | 'minutes'
  | 'focus_sessions'
  | 'words'
  | 'pages'
  | 'chapters'
  | 'scenes'
  | 'lines'
  | 'custom';
export type TaskProgressAggregation = 'sum' | 'latest_total';
export type TaskProgressEntryMode = 'delta' | 'total';
export type TaskProgressSourceType =
  | 'manual'
  | 'import'
  | 'task_completion'
  | 'time_tracking'
  | 'api';
export type TaskProgressGoalType = 'target' | 'habit';
export type TaskProgressGoalStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';
export type TaskProgressRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type TaskLeaderboardStatus = 'active' | 'archived';
export type TaskProgressVisibility = 'private' | 'workspace';

export interface TaskProgressMetric {
  id: string;
  ws_id: string;
  name: string;
  unit_label: string;
  unit_kind: TaskProgressMetricKind;
  description: string | null;
  aggregation: TaskProgressAggregation;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TaskProgressEntry {
  id: string;
  ws_id: string;
  metric_id: string;
  task_id: string | null;
  project_id: string | null;
  board_id: string | null;
  list_id: string | null;
  entry_date: string;
  value: number;
  mode: TaskProgressEntryMode;
  note: string | null;
  tags: string[];
  source_type: TaskProgressSourceType;
  source_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  metric?: TaskProgressMetric;
}

export interface TaskProgressGoal {
  automatic?: boolean;
  expected_progress?: number;
  id: string;
  ws_id: string;
  owner_id: string;
  metric_id: string;
  name: string;
  description: string | null;
  goal_type: TaskProgressGoalType;
  target_value: number;
  period_start: string;
  period_end: string | null;
  recurrence: TaskProgressRecurrence;
  task_id: string | null;
  project_id: string | null;
  board_id: string | null;
  tags: string[];
  status: TaskProgressGoalStatus;
  starred: boolean;
  visibility: TaskProgressVisibility;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  progress?: number;
  remaining?: number;
  percent?: number;
  pace_delta?: number;
  projected_total?: number;
  on_track?: boolean;
  metric?: TaskProgressMetric;
}

export interface TaskLeaderboardTeam {
  id: string;
  leaderboard_id: string;
  name: string;
  color: string | null;
}

export interface TaskLeaderboardMember {
  id: string;
  leaderboard_id: string;
  team_id: string | null;
  user_id: string;
  display_name: string | null;
  status: 'active' | 'left';
  value?: number;
  rank?: number;
  team?: TaskLeaderboardTeam | null;
}

export interface TaskLeaderboard {
  automatic?: boolean;
  id: string;
  ws_id: string;
  metric_id: string;
  name: string;
  description: string | null;
  period_start: string;
  period_end: string | null;
  join_code: string;
  status: TaskLeaderboardStatus;
  starred: boolean;
  visibility: 'workspace';
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  metric?: TaskProgressMetric;
  members?: TaskLeaderboardMember[];
  teams?: TaskLeaderboardTeam[];
  rankings?: TaskLeaderboardMember[];
  teamTotals?: Array<TaskLeaderboardTeam & { value: number }>;
}

export interface SchemaUnavailableResponse {
  ok: false;
  code: 'schema_unavailable';
  schemaAvailable: false;
  message: string;
  [key: string]: unknown;
}

export interface TaskProgressStatsResponse {
  ok: true;
  schemaAvailable: true;
  selectedMetricId: string | null;
  metrics: TaskProgressMetric[];
  summary: {
    activeDays: number;
    averagePerActiveDay: number;
    currentStreak: number;
    entriesCount: number;
    last7Days: number;
    longestStreak: number;
    previous7Days: number;
    today: number;
    total: number;
    trendPercent: number;
  };
  periods: {
    last7Days: number;
    last30Days: number;
    previousMonth: number;
    previousWeek: number;
    thisMonth: number;
    thisWeek: number;
  };
  insights: {
    activeDaysLast30: number;
    averageLast7: number;
    averageLast30: number;
    bestDay: { date: string; value: number } | null;
    consistencyScore: number;
    momentumStatus: 'accelerating' | 'steady' | 'slowing' | 'starting';
    projectedWeek: number;
    recommendation:
      | 'protect_streak'
      | 'raise_goal'
      | 'rebuild_rhythm'
      | 'stay_course'
      | 'start_small';
    strongestWeekday: {
      activeDays: number;
      value: number;
      weekday: number;
    } | null;
    weekTrendPercent: number;
    weekdayTotals: Array<{
      activeDays: number;
      value: number;
      weekday: number;
    }>;
  };
  daily: Array<{ date: string; value: number }>;
  heatmap: Array<{ date: string; value: number }>;
  tags: Array<{ tag: string; value: number }>;
}

export type TaskProgressCatchupPeriod = 'weekly' | 'monthly';

export interface TaskProgressCatchup {
  executiveSummary: string;
  generatedAt: string;
  highlights: string[];
  nextActions: string[];
  period: TaskProgressCatchupPeriod;
  periodEnd: string;
  periodKey: string;
  periodStart: string;
  watchouts: string[];
}

export interface TaskProgressCatchupResponse {
  ok: true;
  cached: boolean;
  catchup: TaskProgressCatchup;
}

export type TaskProgressMetricsResponse =
  | { ok: true; schemaAvailable: true; metrics: TaskProgressMetric[] }
  | (SchemaUnavailableResponse & { metrics?: TaskProgressMetric[] });
export type TaskProgressMetricResponse =
  | { ok: true; schemaAvailable: true; metric: TaskProgressMetric }
  | SchemaUnavailableResponse;
export type TaskProgressEntriesResponse =
  | {
      ok: true;
      schemaAvailable: true;
      entries: TaskProgressEntry[];
      count: number | null;
      page: number;
      pageSize: number;
    }
  | (SchemaUnavailableResponse & { entries?: TaskProgressEntry[] });
export type TaskProgressEntryResponse =
  | { ok: true; schemaAvailable: true; entry: TaskProgressEntry }
  | SchemaUnavailableResponse;
export type TaskProgressGoalsResponse =
  | { ok: true; schemaAvailable: true; goals: TaskProgressGoal[] }
  | (SchemaUnavailableResponse & { goals?: TaskProgressGoal[] });
export type TaskProgressGoalResponse =
  | { ok: true; schemaAvailable: true; goal: TaskProgressGoal }
  | SchemaUnavailableResponse;
export type TaskLeaderboardsResponse =
  | { ok: true; schemaAvailable: true; leaderboards: TaskLeaderboard[] }
  | (SchemaUnavailableResponse & { leaderboards?: TaskLeaderboard[] });
export type TaskLeaderboardResponse =
  | { ok: true; schemaAvailable: true; leaderboard: TaskLeaderboard }
  | SchemaUnavailableResponse;
export type TaskProgressImportResponse =
  | {
      ok: true;
      schemaAvailable: true;
      committed: boolean;
      entries: TaskProgressEntry[];
      summary: { entriesCount: number; total: number };
    }
  | SchemaUnavailableResponse;

export type CreateTaskProgressMetricPayload = Pick<
  TaskProgressMetric,
  'name' | 'unit_label' | 'unit_kind'
> &
  Partial<
    Pick<TaskProgressMetric, 'description' | 'aggregation' | 'is_default'>
  >;
export type UpdateTaskProgressMetricPayload =
  Partial<CreateTaskProgressMetricPayload>;

export type CreateTaskProgressEntryPayload = Pick<
  TaskProgressEntry,
  'metric_id' | 'value'
> &
  Partial<
    Pick<
      TaskProgressEntry,
      | 'task_id'
      | 'project_id'
      | 'board_id'
      | 'list_id'
      | 'entry_date'
      | 'mode'
      | 'note'
      | 'tags'
      | 'source_type'
      | 'source_id'
    >
  >;
export type UpdateTaskProgressEntryPayload =
  Partial<CreateTaskProgressEntryPayload>;

export type CreateTaskProgressGoalPayload = Pick<
  TaskProgressGoal,
  'metric_id' | 'name' | 'target_value' | 'period_start'
> &
  Partial<
    Pick<
      TaskProgressGoal,
      | 'description'
      | 'goal_type'
      | 'period_end'
      | 'recurrence'
      | 'task_id'
      | 'project_id'
      | 'board_id'
      | 'tags'
      | 'status'
      | 'starred'
      | 'visibility'
    >
  >;
export type UpdateTaskProgressGoalPayload =
  Partial<CreateTaskProgressGoalPayload>;

export type CreateTaskLeaderboardPayload = Pick<
  TaskLeaderboard,
  'metric_id' | 'name' | 'period_start'
> &
  Partial<
    Pick<TaskLeaderboard, 'description' | 'period_end' | 'status' | 'starred'>
  >;
export type UpdateTaskLeaderboardPayload =
  Partial<CreateTaskLeaderboardPayload>;
export type CreateTaskLeaderboardTeamPayload = Pick<
  TaskLeaderboardTeam,
  'name'
> &
  Partial<Pick<TaskLeaderboardTeam, 'color'>>;
export type CreateTaskLeaderboardMemberPayload = Partial<
  Pick<TaskLeaderboardMember, 'user_id' | 'team_id' | 'display_name'>
>;
