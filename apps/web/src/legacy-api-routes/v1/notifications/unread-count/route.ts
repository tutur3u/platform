import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { CURRENT_USER_APP_SESSION_AUTH } from '../../users/me/session-auth';
import {
  buildNotificationAccessFilter,
  getNotificationAccessContext,
} from '../access';

const querySchema = z.object({
  wsId: z
    .string()
    .guid()
    .nullable()
    .optional()
    .transform((val) => val || undefined),
});

/**
 * GET /api/v1/notifications/unread-count
 * Gets the unread notification count for the authenticated user.
 * If wsId is provided, scopes to that workspace. Otherwise returns total unread count.
 */
export const GET = withSessionAuth(
  async (req, { user, supabase }) => {
    try {
      const sbAdmin = await createAdminClient();

      const accessContext = await getNotificationAccessContext(supabase, user);

      // Parse and validate query parameters
      const { searchParams } = new URL(req.url);
      const queryParams = querySchema.safeParse({
        wsId: searchParams.get('wsId'),
      });

      if (!queryParams.success) {
        return NextResponse.json(
          { error: 'Invalid query parameters', details: queryParams.error },
          { status: 400 }
        );
      }

      const { wsId } = queryParams.data;

      // If workspace is specified, verify membership
      if (wsId) {
        const membership = await verifyWorkspaceMembershipType({
          wsId: wsId,
          userId: user.id,
          supabase: supabase,
        });

        if (membership.error === 'membership_lookup_failed') {
          console.error(
            'Error checking workspace membership:',
            membership.error
          );
          return NextResponse.json(
            { error: 'Failed to verify workspace access' },
            { status: 500 }
          );
        }

        if (!membership.ok) {
          return NextResponse.json(
            { error: 'Access denied to workspace' },
            { status: 403 }
          );
        }
      }

      // Get unread count - RLS handles access control
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
        console.error('Error fetching unread count:', error);
        return NextResponse.json(
          { error: 'Failed to fetch unread count' },
          { status: 500 }
        );
      }

      return NextResponse.json({ count: count || 0 });
    } catch (error) {
      console.error('Error in unread count API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 15, swr: 15 },
  }
);
