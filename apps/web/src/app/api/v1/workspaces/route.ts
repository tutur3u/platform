import { fetchWorkspaceSummaries } from '@tuturuuu/ui/lib/workspace-actions';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { CURRENT_USER_APP_SESSION_AUTH } from '../users/me/session-auth';

export const GET = withSessionAuth(
  async (request, { supabase, user }) => {
    try {
      return NextResponse.json(
        await fetchWorkspaceSummaries({
          request,
          requireAuth: true,
          supabase,
          userId: user.id,
        })
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'WORKSPACE_SUMMARY_UNAUTHORIZED'
      ) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      serverLogger.error('Error in workspaces API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    cache: { maxAge: 60, swr: 30 },
  }
);
