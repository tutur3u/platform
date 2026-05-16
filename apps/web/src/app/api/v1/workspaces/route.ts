import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { fetchWorkspaceSummaries } from '@tuturuuu/ui/lib/workspace-actions';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const CLI_APP_SESSION_AUTH = {
  requiredScope: CLI_APP_ACCESS_SCOPE,
  targetApp: CLI_APP_TARGET_APP,
} as const;

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
    allowAppSessionAuth: CLI_APP_SESSION_AUTH,
    cache: { maxAge: 60, swr: 30 },
  }
);
