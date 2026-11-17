import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { outcomeResponse } from '@/lib/current-user/context';
import { countUnreadNotifications } from '@/lib/notifications/unread-count';
import { CURRENT_USER_APP_SESSION_AUTH } from '../../users/me/session-auth';

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

      return outcomeResponse(
        await countUnreadNotifications(
          { supabase, user },
          queryParams.data.wsId
        )
      );
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
    preferSupabaseSessionAuth: true,
  }
);
