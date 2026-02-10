import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  WorkspaceOverviewRow,
  WorkspaceOverviewSummary,
} from '@tuturuuu/types';

interface GetWorkspaceOverviewParams {
  search?: string;
  tier?: string;
  status?: string;
  workspaceType?: string;
  subCount?: string;
  sortBy?: string;
  sortOrder?: string;
  pageSize?: string;
  page?: string;
}

export async function getWorkspaceOverview(
  params: GetWorkspaceOverviewParams
): Promise<{ data: WorkspaceOverviewRow[]; count: number }> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) return { data: [], count: 0 };

  const { data, error } = await supabaseAdmin.rpc('get_workspace_overview', {
    p_search: params.search || undefined,
    p_tier: params.tier || undefined,
    p_status: params.status || undefined,
    p_workspace_type: params.workspaceType || undefined,
    p_sub_count: params.subCount || undefined,
    p_sort_by: params.sortBy || 'created_at',
    p_sort_order: params.sortOrder || 'desc',
    p_page_size: parseInt(params.pageSize || '10', 10),
    p_page: parseInt(params.page || '1', 10),
  });

  if (error) {
    console.error('get_workspace_overview RPC error:', error);
    return { data: [], count: 0 };
  }

  const rows = (data as WorkspaceOverviewRow[]) || [];
  const count = rows[0]?.total_count ?? 0;

  return { data: rows, count };
}

export async function getWorkspaceOverviewSummary(): Promise<WorkspaceOverviewSummary> {
  const fallback: WorkspaceOverviewSummary = {
    total_workspaces: 0,
    personal_workspaces: 0,
    team_workspaces: 0,
    with_active_subscription: 0,
    tier_free: 0,
    tier_plus: 0,
    tier_pro: 0,
    tier_enterprise: 0,
    avg_members: 0,
    empty_workspaces: 0,
    with_zero_subscriptions: 0,
    with_single_subscription: 0,
    with_multiple_subscriptions: 0,
  };

  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) return fallback;

  const { data, error } = await supabaseAdmin.rpc(
    'get_workspace_overview_summary'
  );

  if (error) {
    console.error('get_workspace_overview_summary RPC error:', error);
    return fallback;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return fallback;

  return {
    total_workspaces: Number(row.total_workspaces) || 0,
    personal_workspaces: Number(row.personal_workspaces) || 0,
    team_workspaces: Number(row.team_workspaces) || 0,
    with_active_subscription: Number(row.with_active_subscription) || 0,
    tier_free: Number(row.tier_free) || 0,
    tier_plus: Number(row.tier_plus) || 0,
    tier_pro: Number(row.tier_pro) || 0,
    tier_enterprise: Number(row.tier_enterprise) || 0,
    avg_members: Number(row.avg_members) || 0,
    empty_workspaces: Number(row.empty_workspaces) || 0,
    with_zero_subscriptions: Number(row.with_zero_subscriptions) || 0,
    with_single_subscription: Number(row.with_single_subscription) || 0,
    with_multiple_subscriptions: Number(row.with_multiple_subscriptions) || 0,
  };
}
