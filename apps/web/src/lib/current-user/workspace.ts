import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  loadTaskBoardGuestSharesForWorkspace,
  summarizeTaskBoardGuestShares,
} from '@tuturuuu/tasks-api/server/board-access';
import type { CurrentUserReadContext, SectionOutcome } from './context';

const WORKSPACE_CACHE_CONTROL =
  'private, max-age=60, stale-while-revalidate=30';

/**
 * Body of `GET /api/workspaces/:wsId` for an already normalized workspace id:
 * the workspace for a member, the guest shape for a board-share guest, and a
 * 500 otherwise. The 500 is flagged `unavailable` when the workspace row is
 * simply not readable (missing or not a member), not when the lookup failed.
 */
export async function readWorkspaceForUser(
  ctx: Omit<CurrentUserReadContext, 'db'>,
  wsId: string
): Promise<SectionOutcome> {
  const { supabase, user } = ctx;
  const { data, error } = await supabase
    .from('workspaces')
    .select('*, workspace_members!inner(user_id)')
    .eq('id', wsId)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error || !data?.workspace_members[0]?.user_id) {
    const sbAdmin = await createAdminClient({ noCookie: true });
    const guestShares = await loadTaskBoardGuestSharesForWorkspace({
      sbAdmin,
      user,
      workspaceId: wsId,
    });
    const guestSummary = summarizeTaskBoardGuestShares(guestShares);
    let guestLookupFailed = false;

    if (guestSummary.boardCount > 0) {
      const { data: guestWorkspace, error: guestWorkspaceError } = await sbAdmin
        .from('workspaces')
        .select('*')
        .eq('id', wsId)
        .single();

      if (!guestWorkspaceError && guestWorkspace) {
        return {
          body: {
            ...guestWorkspace,
            access_type: 'guest',
            guest_board_count: guestSummary.boardCount,
            guest_highest_permission: guestSummary.highestPermission,
            guest_landing_path: guestSummary.landingPath,
            guest_products: ['tasks'],
          },
          headers: { 'Cache-Control': WORKSPACE_CACHE_CONTROL },
          status: 200,
        };
      }

      guestLookupFailed =
        !!guestWorkspaceError && guestWorkspaceError.code !== 'PGRST116';
    }

    // A missing row is "unavailable"; any other lookup error stays a failure.
    const lookupFailed =
      (!!error && error.code !== 'PGRST116') || guestLookupFailed;
    return {
      body: { message: 'Error fetching workspaces' },
      status: 500,
      ...(lookupFailed ? {} : { unavailable: true as const }),
    };
  }

  const { workspace_members: workspaceMembers, ...workspaceData } = data;

  void workspaceMembers;

  return {
    body: workspaceData,
    headers: { 'Cache-Control': WORKSPACE_CACHE_CONTROL },
    status: 200,
  };
}
