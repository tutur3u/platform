import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type {
  CurrentUserReadContext,
  SectionOutcome,
} from '@/lib/current-user/context';
import {
  buildNotificationAccessFilter,
  getNotificationAccessContext,
} from '@/legacy-api-routes/v1/notifications/access';

/**
 * Body of `GET /api/v1/notifications/unread-count`. `wsId`, when set, scopes
 * the count to a workspace the caller must belong to.
 */
export async function countUnreadNotifications(
  ctx: Omit<CurrentUserReadContext, 'db'>,
  wsId: string | undefined
): Promise<SectionOutcome> {
  const { supabase, user } = ctx;
  const sbAdmin = await createAdminClient();

  const accessContext = await getNotificationAccessContext(
    supabase,
    user,
    sbAdmin
  );

  if (wsId) {
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return {
        body: { error: 'Failed to verify workspace access' },
        log: ['Error checking workspace membership:', membership.error],
        status: 500,
      };
    }

    if (!membership.ok) {
      return { body: { error: 'Access denied to workspace' }, status: 403 };
    }
  }

  let query = sbAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .or(buildNotificationAccessFilter(accessContext))
    .is('read_at', null);

  if (wsId) {
    query = query.eq('ws_id', wsId);
  }

  const { count, error } = await query;

  if (error) {
    return {
      body: { error: 'Failed to fetch unread count' },
      log: ['Error fetching unread count:', error],
      status: 500,
    };
  }

  return { body: { count: count || 0 }, status: 200 };
}
