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

export const HabitTrackerUseCases = [
  'generic',
  'body_weight',
  'counter',
  'measurement',
  'workout_session',
  'wellness_check',
] as const;
export type HabitTrackerUseCase = (typeof HabitTrackerUseCases)[number];

export const HabitTrackerTemplateCategories = [
  'strength',
  'health',
  'recovery',
  'discipline',
  'custom',
] as const;
export type HabitTrackerTemplateCategory =
  (typeof HabitTrackerTemplateCategories)[number];

export const HabitTrackerComposerModes = [
  'quick_check',
  'quick_increment',
  'measurement',
  'workout_session',
  'advanced_custom',
] as const;
export type HabitTrackerComposerMode =
  (typeof HabitTrackerComposerModes)[number];

export const HabitTrackerProgressVariants = ['ring', 'bar', 'check'] as const;
export type HabitTrackerProgressVariant =
  (typeof HabitTrackerProgressVariants)[number];

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

export interface HabitTrackerComposerConfig {
  unit?: string | null;
  supported_units?: string[];
  suggested_increments?: number[];
  progress_variant?: HabitTrackerProgressVariant;
  suggested_exercises?: string[];
  default_sets?: number | null;
  default_reps?: number | null;
  default_weight_unit?: string | null;
}

export interface HabitTrackerExerciseBlock {
  exercise_name: string;
  sets: number;
  reps: number;
  weight?: number | null;
  unit?: string | null;
  notes?: string | null;
}

export type HabitTrackerEntryValue =
  | boolean
  | number
  | string
  | null
  | HabitTrackerExerciseBlock[];

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
  use_case?: HabitTrackerUseCase;
  template_category?: HabitTrackerTemplateCategory;
  composer_mode?: HabitTrackerComposerMode;
  composer_config?: HabitTrackerComposerConfig | null;
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
  values: Record<string, HabitTrackerEntryValue>;
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
  latest_value?: number | null;
  latest_entry_id?: string | null;
  latest_entry_date?: string | null;
  latest_occurred_at?: string | null;
  latest_values?: Record<string, HabitTrackerEntryValue> | null;
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
  use_case?: HabitTrackerUseCase;
  template_category?: HabitTrackerTemplateCategory;
  composer_mode?: HabitTrackerComposerMode;
  composer_config?: HabitTrackerComposerConfig | null;
  start_date?: string;
  is_active?: boolean;
}

export interface HabitTrackerEntryInput {
  entry_kind?: HabitTrackerEntryKind;
  entry_date: string;
  occurred_at?: string;
  values: Record<string, HabitTrackerEntryValue>;
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
  use_case?: HabitTrackerUseCase;
  template_category?: HabitTrackerTemplateCategory;
  composer_mode?: HabitTrackerComposerMode;
  composer_config?: HabitTrackerComposerConfig | null;
}
