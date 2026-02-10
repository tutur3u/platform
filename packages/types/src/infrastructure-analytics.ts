// Infrastructure Analytics Type Definitions

export interface EngagementMetrics {
  dau: number;
  wau: number;
  mau: number;
  date?: string;
}

export interface EngagementMetricsOverTime {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

export interface SessionStatistics {
  total_sessions: number;
  active_sessions: number;
  avg_session_duration_hours: number;
  median_session_duration_minutes: number;
  sessions_today: number;
  sessions_this_week: number;
  sessions_this_month: number;
}

export interface SessionByDevice {
  device_type: string;
  session_count: number;
  percentage: number;
}

export interface AuthProviderStats {
  provider: string;
  user_count: number;
  percentage: number;
  last_sign_in_avg: string | null;
}

export interface SignInByProvider {
  date: string;
  provider: string;
  sign_in_count: number;
}

export interface FeatureAdoption {
  feature_name: string;
  adoption_percentage: number;
  total_users: number;
  active_users: number;
}

export interface PowerUser {
  user_id: string;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  action_count: number;
  last_seen: string;
}

export interface UserGrowthStats {
  period: string;
  new_users: number;
  cumulative_users: number;
}

export interface UserGrowthComparison {
  total_users: number;
  users_today: number;
  users_this_week: number;
  users_this_month: number;
  growth_rate_weekly: number | null;
  growth_rate_monthly: number | null;
}

export interface WorkspaceStatistics {
  total_workspaces: number;
  active_workspaces: number;
  avg_members_per_workspace: number;
  median_members_per_workspace: number;
  empty_workspace_count: number;
  workspaces_created_today: number;
  workspaces_created_this_week: number;
  workspaces_created_this_month: number;
}

export interface WorkspaceMemberDistribution {
  member_range: string;
  workspace_count: number;
  percentage: number;
}

export interface AuditLogActionSummary {
  action: string;
  action_count: number;
  last_occurrence: string;
  unique_users: number;
}

export interface ActionFrequencyByHour {
  hour_of_day: number;
  action_count: number;
}

export interface RecentAuditLog {
  id: string;
  action: string;
  actor_id: string | null;
  actor_username: string | null;
  log_type: string | null;
  created_at: string;
  ip_address: string;
}

export interface UserActivityCohort {
  cohort_name: string;
  user_count: number;
  percentage: number;
}

export interface RetentionRate {
  cohort_period: string;
  cohort_size: number;
  retained_users: number;
  retention_rate: number;
}

export interface ActivityHeatmap {
  day_of_week: number;
  hour_of_day: number;
  activity_count: number;
}

export interface MetricCard {
  title: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  trend?: 'up' | 'down' | 'stable';
  icon?: React.ReactNode;
}

// Combined analytics response types
export interface InfrastructureAnalytics {
  engagement: {
    current: EngagementMetrics;
    overTime: EngagementMetricsOverTime[];
  };
  sessions: {
    statistics: SessionStatistics;
    byDevice: SessionByDevice[];
  };
  auth: {
    providerStats: AuthProviderStats[];
    signInsByProvider: SignInByProvider[];
  };
  users: {
    growth: UserGrowthStats[];
    comparison: UserGrowthComparison;
    cohorts: UserActivityCohort[];
  };
  workspaces: {
    statistics: WorkspaceStatistics;
    distribution: WorkspaceMemberDistribution[];
  };
  activity: {
    recentActions: AuditLogActionSummary[];
    frequencyByHour: ActionFrequencyByHour[];
    recentLogs: RecentAuditLog[];
    heatmap: ActivityHeatmap[];
  };
  retention: RetentionRate[];
}

// Workspace overview dashboard types (infrastructure/workspaces page)
export interface WorkspaceOverviewRow {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  personal: boolean;
  creator_id: string | null;
  creator_name: string | null;
  creator_email: string | null;
  created_at: string;
  member_count: number;
  role_count: number;
  secret_count: number;
  active_subscription_count: number;
  highest_tier: string | null;
  subscription_statuses: string[];
  has_subscription_error: boolean;
  total_count: number;
}

export interface WorkspaceOverviewSummary {
  total_workspaces: number;
  personal_workspaces: number;
  team_workspaces: number;
  with_active_subscription: number;
  tier_free: number;
  tier_plus: number;
  tier_pro: number;
  tier_enterprise: number;
  avg_members: number;
  empty_workspaces: number;
  with_zero_subscriptions: number;
  with_single_subscription: number;
  with_multiple_subscriptions: number;
  errored_workspaces: number;
}

// User registration data (existing)
export interface UserRegistrationData {
  date: string;
  count: number;
  created_at: string;
}
