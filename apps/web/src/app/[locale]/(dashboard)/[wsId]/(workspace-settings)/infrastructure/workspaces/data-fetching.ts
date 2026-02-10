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
  sortBy?: string;
  sortOrder?: string;
}

const BATCH_SIZE = 1000;

/**
 * Fetches ALL workspaces matching the given filters by batching through
 * pages of BATCH_SIZE rows. This ensures the admin dashboard has the
 * complete dataset regardless of total workspace count.
 */
export async function getAllWorkspaceOverview(
  params: GetWorkspaceOverviewParams
): Promise<{ data: WorkspaceOverviewRow[]; count: number }> {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) return { data: [], count: 0 };

  const rpcParams = {
    p_search: params.search || undefined,
    p_tier: params.tier || undefined,
    p_status: params.status || undefined,
    p_workspace_type: params.workspaceType || undefined,
    p_sort_by: params.sortBy || 'created_at',
    p_sort_order: params.sortOrder || 'desc',
  };

  // First batch — also gives us total_count for calculating remaining pages
  const { data: firstBatch, error } = await supabaseAdmin.rpc(
    'get_workspace_overview',
    { ...rpcParams, p_page_size: BATCH_SIZE, p_page: 1 }
  );

  if (error) {
    console.error('get_workspace_overview RPC error:', error);
    return { data: [], count: 0 };
  }

  const firstRows = (firstBatch as WorkspaceOverviewRow[]) || [];
  const totalCount = firstRows[0]?.total_count ?? 0;

  // If everything fits in one batch, return immediately
  if (totalCount <= BATCH_SIZE) {
    return { data: firstRows, count: totalCount };
  }

  // Fetch remaining pages in parallel
  const totalPages = Math.ceil(totalCount / BATCH_SIZE);
  const remainingPromises = Array.from({ length: totalPages - 1 }, (_, i) =>
    supabaseAdmin
      .rpc('get_workspace_overview', {
        ...rpcParams,
        p_page_size: BATCH_SIZE,
        p_page: i + 2,
      })
      .then(({ data, error }) => {
        if (error) {
          console.error(`Batch page ${i + 2} error:`, error);
          return [] as WorkspaceOverviewRow[];
        }
        return (data as WorkspaceOverviewRow[]) || [];
      })
  );

  const remainingBatches = await Promise.all(remainingPromises);

  return {
    data: [...firstRows, ...remainingBatches.flat()],
    count: totalCount,
  };
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
  };
}
