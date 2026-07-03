import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getWorkspaceInviteStatus } from '@/lib/workspace-invitations/status';

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, { user }, { wsId }) => {
    const admin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;

    try {
      const result = await getWorkspaceInviteStatus(admin, {
        authEmail: user.email ?? null,
        userId: user.id,
        workspaceId: wsId,
      });

      if (!result.workspace) {
        return NextResponse.json(
          {
            error: 'Workspace not found',
            errorCode: 'WORKSPACE_NOT_FOUND',
          },
          { status: 404 }
        );
      }

      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (error) {
      serverLogger.error('Failed to read workspace invite status:', {
        error,
        userId: user.id,
        wsId,
      });

      return NextResponse.json(
        {
          error: 'Failed to read workspace invite status',
          errorCode: 'WORKSPACE_INVITE_STATUS_LOOKUP_FAILED',
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
