import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  ActionFrequencyByHour,
  ActivityHeatmap,
  AuditLogActionSummary,
  AuthProviderStats,
  EngagementMetrics,
  EngagementMetricsOverTime,
  FeatureAdoption,
  PowerUser,
  RecentAuditLog,
  RetentionRate,
  SessionByDevice,
  SessionStatistics,
  SignInByProvider,
  UserActivityCohort,
  UserGrowthComparison,
  UserGrowthStats,
  UserRegistrationData,
  WorkspaceMemberDistribution,
  WorkspaceStatistics,
} from '@tuturuuu/types';

/**
 * Get current engagement metrics (DAU, WAU, MAU)
 */
export async function getEngagementMetrics(): Promise<EngagementMetrics> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const [dauResult, wauResult, mauResult] = await Promise.all([
      supabaseAdmin.rpc('get_dau_count'),
      supabaseAdmin.rpc('get_wau_count'),
      supabaseAdmin.rpc('get_mau_count'),
    ]);

    if (dauResult.error) throw dauResult.error;
    if (wauResult.error) throw wauResult.error;
    if (mauResult.error) throw mauResult.error;

    return {
      dau: Number(dauResult.data || 0),
      wau: Number(wauResult.data || 0),
      mau: Number(mauResult.data || 0),
    };
  } catch (error) {
    console.error('Error fetching engagement metrics:', error);
    return { dau: 0, wau: 0, mau: 0 };
  }
}

/**
 * Get engagement metrics over time
 */
export async function getEngagementMetricsOverTime(
  days: number = 90
): Promise<EngagementMetricsOverTime[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_engagement_metrics_over_time',
      { days }
    );

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        date: item.date,
        dau: Number(item.dau || 0),
        wau: Number(item.wau || 0),
        mau: Number(item.mau || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching engagement metrics over time:', error);
    return [];
  }
}

/**
 * Get session statistics
 */
export async function getSessionStatistics(): Promise<SessionStatistics> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_auth_session_statistics'
    );

    if (error) throw error;

    const stats = (data?.[0] || {}) as Partial<SessionStatistics>;

    return {
      total_sessions: Number(stats.total_sessions || 0),
      active_sessions: Number(stats.active_sessions || 0),
      avg_session_duration_hours: Number(stats.avg_session_duration_hours || 0),
      median_session_duration_minutes: Number(
        stats.median_session_duration_minutes || 0
      ),
      sessions_today: Number(stats.sessions_today || 0),
      sessions_this_week: Number(stats.sessions_this_week || 0),
      sessions_this_month: Number(stats.sessions_this_month || 0),
    };
  } catch (error) {
    console.error('Error fetching session statistics:', error);
    return {
      total_sessions: 0,
      active_sessions: 0,
      avg_session_duration_hours: 0,
      median_session_duration_minutes: 0,
      sessions_today: 0,
      sessions_this_week: 0,
      sessions_this_month: 0,
    };
  }
}

/**
 * Get sessions by device type
 */
export async function getSessionsByDevice(): Promise<SessionByDevice[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_sessions_by_device');

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        device_type: item.device_type,
        session_count: Number(item.session_count || 0),
        percentage: Number(item.percentage || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching sessions by device:', error);
    return [];
  }
}

/**
 * Get auth provider statistics
 */
export async function getAuthProviderStats(): Promise<AuthProviderStats[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_auth_provider_stats');

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        provider: item.provider,
        user_count: Number(item.user_count || 0),
        percentage: Number(item.percentage || 0),
        last_sign_in_avg: item.last_sign_in_avg,
      })) || []
    );
  } catch (error) {
    console.error('Error fetching auth provider stats:', error);
    return [];
  }
}

/**
 * Get sign-ins by provider over time
 */
export async function getSignInsByProvider(
  days: number = 30
): Promise<SignInByProvider[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_sign_ins_by_provider',
      {
        days,
      }
    );

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        date: item.date,
        provider: item.provider,
        sign_in_count: Number(item.sign_in_count || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching sign-ins by provider:', error);
    return [];
  }
}

/**
 * Get user growth statistics
 */
export async function getUserGrowthStats(
  timePeriod: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<UserGrowthStats[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_user_growth_stats', {
      time_period: timePeriod,
    });

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        period: item.period,
        new_users: Number(item.new_users || 0),
        cumulative_users: Number(item.cumulative_users || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching user growth stats:', error);
    return [];
  }
}

/**
 * Get user growth comparison
 */
export async function getUserGrowthComparison(): Promise<UserGrowthComparison> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_user_growth_comparison'
    );

    if (error) throw error;

    const stats = (data?.[0] || {}) as Partial<UserGrowthComparison>;

    return {
      total_users: Number(stats.total_users || 0),
      users_today: Number(stats.users_today || 0),
      users_this_week: Number(stats.users_this_week || 0),
      users_this_month: Number(stats.users_this_month || 0),
      growth_rate_weekly: stats.growth_rate_weekly
        ? Number(stats.growth_rate_weekly)
        : null,
      growth_rate_monthly: stats.growth_rate_monthly
        ? Number(stats.growth_rate_monthly)
        : null,
    };
  } catch (error) {
    console.error('Error fetching user growth comparison:', error);
    return {
      total_users: 0,
      users_today: 0,
      users_this_week: 0,
      users_this_month: 0,
      growth_rate_weekly: null,
      growth_rate_monthly: null,
    };
  }
}

/**
 * Get workspace statistics
 */
export async function getWorkspaceStatistics(): Promise<WorkspaceStatistics> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_workspace_statistics');

    if (error) throw error;

    const stats = (data?.[0] || {}) as Partial<WorkspaceStatistics>;

    return {
      total_workspaces: Number(stats.total_workspaces || 0),
      active_workspaces: Number(stats.active_workspaces || 0),
      avg_members_per_workspace: Number(stats.avg_members_per_workspace || 0),
      median_members_per_workspace: Number(
        stats.median_members_per_workspace || 0
      ),
      empty_workspace_count: Number(stats.empty_workspace_count || 0),
      workspaces_created_today: Number(stats.workspaces_created_today || 0),
      workspaces_created_this_week: Number(
        stats.workspaces_created_this_week || 0
      ),
      workspaces_created_this_month: Number(
        stats.workspaces_created_this_month || 0
      ),
    };
  } catch (error) {
    console.error('Error fetching workspace statistics:', error);
    return {
      total_workspaces: 0,
      active_workspaces: 0,
      avg_members_per_workspace: 0,
      median_members_per_workspace: 0,
      empty_workspace_count: 0,
      workspaces_created_today: 0,
      workspaces_created_this_week: 0,
      workspaces_created_this_month: 0,
    };
  }
}

/**
 * Get workspace member distribution
 */
export async function getWorkspaceMemberDistribution(): Promise<
  WorkspaceMemberDistribution[]
> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_workspace_member_distribution'
    );

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        member_range: item.member_range,
        workspace_count: Number(item.workspace_count || 0),
        percentage: Number(item.percentage || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching workspace member distribution:', error);
    return [];
  }
}

/**
 * Get recent actions summary from audit logs
 */
export async function getRecentActionsSummary(
  limitCount: number = 100
): Promise<AuditLogActionSummary[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_recent_actions_summary',
      {
        limit_count: limitCount,
      }
    );

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        action: item.action,
        action_count: Number(item.action_count || 0),
        last_occurrence: item.last_occurrence,
        unique_users: Number(item.unique_users || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching recent actions summary:', error);
    return [];
  }
}

/**
 * Get action frequency by hour
 */
export async function getActionFrequencyByHour(): Promise<
  ActionFrequencyByHour[]
> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_action_frequency_by_hour'
    );

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        hour_of_day: Number(item.hour_of_day || 0),
        action_count: Number(item.action_count || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching action frequency by hour:', error);
    return [];
  }
}

/**
 * Get recent audit logs
 */
export async function getRecentAuditLogs(
  limitCount: number = 50
): Promise<RecentAuditLog[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_recent_audit_logs', {
      limit_count: limitCount,
    });

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        id: item.id,
        action: item.action,
        actor_id: item.actor_id,
        actor_username: item.actor_username,
        log_type: item.log_type,
        created_at: item.created_at,
        ip_address: item.ip_address,
      })) || []
    );
  } catch (error) {
    console.error('Error fetching recent audit logs:', error);
    return [];
  }
}

/**
 * Get user activity cohorts
 */
export async function getUserActivityCohorts(): Promise<UserActivityCohort[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'get_user_activity_cohorts'
    );

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        cohort_name: item.cohort_name,
        user_count: Number(item.user_count || 0),
        percentage: Number(item.percentage || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching user activity cohorts:', error);
    return [];
  }
}

/**
 * Get retention rate
 */
export async function getRetentionRate(
  period: 'daily' | 'weekly' | 'monthly' = 'weekly'
): Promise<RetentionRate[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_retention_rate', {
      period,
    });

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        cohort_period: item.cohort_period,
        cohort_size: Number(item.cohort_size || 0),
        retained_users: Number(item.retained_users || 0),
        retention_rate: Number(item.retention_rate || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching retention rate:', error);
    return [];
  }
}

/**
 * Get activity heatmap data
 */
export async function getActivityHeatmap(): Promise<ActivityHeatmap[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_activity_heatmap');

    if (error) throw error;

    return (
      data?.map((item: any) => ({
        day_of_week: Number(item.day_of_week || 0),
        hour_of_day: Number(item.hour_of_day || 0),
        activity_count: Number(item.activity_count || 0),
      })) || []
    );
  } catch (error) {
    console.error('Error fetching activity heatmap:', error);
    return [];
  }
}

/**
 * Get user registration data (existing function, included for completeness)
 */
export async function getUserRegistrationData(): Promise<
  UserRegistrationData[]
> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (
      data
        ?.filter((user): user is { created_at: string } => !!user.created_at)
        ?.map((user) => ({
          date: user.created_at,
          count: 1,
          created_at: user.created_at,
        })) || []
    );
  } catch (error) {
    console.error('Error fetching user registration data:', error);
    return [];
  }
}

/**
 * Get power users
 */
export async function getPowerUsers(limit: number = 10): Promise<PowerUser[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_power_users', {
      limit_count: limit,
    });
    if (error) throw error;
    return (
      data?.map((user: any) => ({
        user_id: user.user_id,
        username: user.username || null,
        email: user.email || null,
        avatar_url: user.avatar_url || null,
        action_count: user.action_count,
        last_seen: user.last_seen,
      })) || []
    );
  } catch (error) {
    console.error('Error fetching power users:', error);
    return [];
  }
}

/**
 * Get feature adoption
 */
export async function getFeatureAdoption(
  prefix: string
): Promise<FeatureAdoption[]> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) throw new Error('Failed to create admin client');

  try {
    const { data, error } = await supabaseAdmin.rpc('get_feature_adoption', {
      feature_action_prefix: prefix,
    });
    if (error) throw error;
    return (
      data?.map((item: any) => ({
        feature_name: item.feature_name,
        adoption_percentage: item.adoption_percentage,
        total_users: item.total_users || 0,
        active_users: item.active_users || item.adoption_count || 0,
      })) || []
    );
  } catch (error) {
    console.error('Error fetching feature adoption:', error);
    return [];
  }
}
