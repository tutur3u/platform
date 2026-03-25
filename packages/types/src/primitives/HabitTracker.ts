import type { SupportedColor } from './SupportedColors';

export const HabitTrackerTrackingModes = [
  'event_log',
  'daily_summary',
] as const;
export type HabitTrackerTrackingMode =
  (typeof HabitTrackerTrackingModes)[number];

export const HabitTrackerTargetPeriods = ['daily', 'weekly'] as const;
export type HabitTrackerTargetPeriod =
  (typeof HabitTrackerTargetPeriods)[number];

export const HabitTrackerTargetOperators = ['gte', 'eq'] as const;
export type HabitTrackerTargetOperator =
  (typeof HabitTrackerTargetOperators)[number];

export const HabitTrackerAggregationStrategies = [
  'sum',
  'max',
  'count_entries',
  'boolean_any',
] as const;
export type HabitTrackerAggregationStrategy =
  (typeof HabitTrackerAggregationStrategies)[number];

export const HabitTrackerFieldTypes = [
  'boolean',
  'number',
  'duration',
  'text',
  'select',
] as const;
export type HabitTrackerFieldType = (typeof HabitTrackerFieldTypes)[number];

export const HabitTrackerEntryKinds = ['event_log', 'daily_summary'] as const;
export type HabitTrackerEntryKind = (typeof HabitTrackerEntryKinds)[number];

export const HabitTrackerStreakActionTypes = ['freeze', 'repair'] as const;
export type HabitTrackerStreakActionType =
  (typeof HabitTrackerStreakActionTypes)[number];

export const HabitTrackerScopes = ['self', 'team', 'member'] as const;
export type HabitTrackerScope = (typeof HabitTrackerScopes)[number];

export interface HabitTrackerFieldOption {
  label: string;
  value: string;
}

export interface HabitTrackerFieldSchema {
  key: string;
  label: string;
  type: HabitTrackerFieldType;
  unit?: string | null;
  required?: boolean;
  options?: HabitTrackerFieldOption[];
}

export interface HabitTracker {
  id: string;
  ws_id: string;
  name: string;
  description?: string | null;
  color: SupportedColor;
  icon: string;
  tracking_mode: HabitTrackerTrackingMode;
  target_period: HabitTrackerTargetPeriod;
  target_operator: HabitTrackerTargetOperator;
  target_value: number;
  primary_metric_key: string;
  aggregation_strategy: HabitTrackerAggregationStrategy;
  input_schema: HabitTrackerFieldSchema[];
  quick_add_values: number[];
  freeze_allowance: number;
  recovery_window_periods: number;
  start_date: string;
  created_by?: string | null;
  is_active: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitTrackerEntry {
  id: string;
  ws_id: string;
  tracker_id: string;
  user_id: string;
  entry_kind: HabitTrackerEntryKind;
  entry_date: string;
  occurred_at: string;
  values: Record<string, boolean | number | string | null>;
  primary_value?: number | null;
  note?: string | null;
  tags: string[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitTrackerStreakAction {
  id: string;
  ws_id: string;
  tracker_id: string;
  user_id: string;
  action_type: HabitTrackerStreakActionType;
  period_start: string;
  period_end: string;
  note?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitTrackerMember {
  user_id: string;
  workspace_user_id?: string | null;
  display_name: string;
  email?: string | null;
  avatar_url?: string | null;
}

export interface HabitTrackerPeriodMetric {
  period_start: string;
  period_end: string;
  total: number;
  success: boolean;
  used_freeze: boolean;
  used_repair: boolean;
  entry_count: number;
}

export interface HabitTrackerRecoveryWindowState {
  eligible: boolean;
  period_start?: string | null;
  period_end?: string | null;
  expires_on?: string | null;
  action?: HabitTrackerStreakActionType | null;
}

export interface HabitTrackerStreakSummary {
  current_streak: number;
  best_streak: number;
  last_success_date?: string | null;
  freeze_count: number;
  freezes_used: number;
  perfect_week_count: number;
  consistency_rate: number;
  recovery_window: HabitTrackerRecoveryWindowState;
}

export interface HabitTrackerMemberSummary {
  member: HabitTrackerMember;
  total: number;
  entry_count: number;
  current_period_total: number;
  streak: HabitTrackerStreakSummary;
}

export interface HabitTrackerLeaderboardRow {
  member: HabitTrackerMember;
  current_streak: number;
  best_streak: number;
  consistency_rate: number;
  current_period_total: number;
}

export interface HabitTrackerTeamSummary {
  active_members: number;
  total_entries: number;
  total_value: number;
  average_consistency_rate: number;
  top_streak: number;
}

export interface HabitTrackerCardSummary {
  tracker: HabitTracker;
  current_member?: HabitTrackerMemberSummary;
  team?: HabitTrackerTeamSummary;
  leaderboard: HabitTrackerLeaderboardRow[];
}

export interface HabitTrackerListResponse {
  trackers: HabitTrackerCardSummary[];
  members: HabitTrackerMember[];
  scope: HabitTrackerScope;
  scopeUserId: string | null;
  viewerUserId: string;
}

export interface HabitTrackerDetailResponse {
  tracker: HabitTracker;
  entries: Array<
    HabitTrackerEntry & {
      member?: HabitTrackerMember | null;
    }
  >;
  current_member?: HabitTrackerMemberSummary;
  team?: HabitTrackerTeamSummary;
  member_summaries: HabitTrackerMemberSummary[];
  leaderboard: HabitTrackerLeaderboardRow[];
  current_period_metrics: HabitTrackerPeriodMetric[];
}

export interface HabitTrackerInput {
  name: string;
  description?: string | null;
  color: SupportedColor;
  icon: string;
  tracking_mode: HabitTrackerTrackingMode;
  target_period: HabitTrackerTargetPeriod;
  target_operator: HabitTrackerTargetOperator;
  target_value: number;
  primary_metric_key: string;
  aggregation_strategy: HabitTrackerAggregationStrategy;
  input_schema: HabitTrackerFieldSchema[];
  quick_add_values?: number[];
  freeze_allowance?: number;
  recovery_window_periods?: number;
  start_date?: string;
  is_active?: boolean;
}

export interface HabitTrackerEntryInput {
  entry_kind?: HabitTrackerEntryKind;
  entry_date: string;
  occurred_at?: string;
  values: Record<string, boolean | number | string | null>;
  primary_value?: number | null;
  note?: string | null;
  tags?: string[];
  user_id?: string;
}

export interface HabitTrackerStreakActionInput {
  action_type: HabitTrackerStreakActionType;
  period_start: string;
  note?: string | null;
  user_id?: string;
}

export interface HabitTrackerTemplate {
  id: string;
  name: string;
  description: string;
  color: SupportedColor;
  icon: string;
  tracking_mode: HabitTrackerTrackingMode;
  target_period: HabitTrackerTargetPeriod;
  target_operator: HabitTrackerTargetOperator;
  target_value: number;
  primary_metric_key: string;
  aggregation_strategy: HabitTrackerAggregationStrategy;
  quick_add_values: number[];
  input_schema: HabitTrackerFieldSchema[];
  freeze_allowance: number;
  recovery_window_periods: number;
}
