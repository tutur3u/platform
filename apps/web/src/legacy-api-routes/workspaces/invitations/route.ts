import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { listPendingWorkspaceInvitations } from '@/lib/workspace-invitations/status';

export const GET = withSessionAuth(
  async (_request, { user }) => {
    const admin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;

    try {
      const invitations = await listPendingWorkspaceInvitations(admin, {
        authEmail: user.email ?? null,
        userId: user.id,
      });

      return NextResponse.json(
        { invitations },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        }
      );
    } catch (error) {
      serverLogger.error('Failed to list workspace invitations:', {
        error,
        userId: user.id,
      });

      return NextResponse.json(
        {
          error: 'Failed to list workspace invitations',
          errorCode: 'WORKSPACE_INVITATIONS_LOOKUP_FAILED',
        },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 0 },
    rateLimitKind: 'read',
  }
);
