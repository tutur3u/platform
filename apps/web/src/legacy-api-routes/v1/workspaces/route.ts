import { fetchWorkspaceSummaries } from '@tuturuuu/ui/lib/workspace-actions';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { CURRENT_USER_APP_SESSION_AUTH } from '../users/me/session-auth';

const MAX_WORKSPACE_QUERY_LENGTH = 120;
const MAX_WORKSPACE_SEARCH_LIMIT = 100;

function parseWorkspaceSearchParams(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed: { limit?: number; query?: string } = {};
  const q = searchParams.get('q')?.trim() || undefined;
  const rawLimit = searchParams.get('limit');
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_WORKSPACE_SEARCH_LIMIT, Math.max(1, parsedLimit as number))
    : undefined;

  if (limit) parsed.limit = limit;
  if (q) parsed.query = q.slice(0, MAX_WORKSPACE_QUERY_LENGTH);

  return parsed;
}

export const GET = withSessionAuth(
  async (request, { supabase, user }) => {
    try {
      const workspaceSearchParams = parseWorkspaceSearchParams(request);

      return NextResponse.json(
        await fetchWorkspaceSummaries({
          ...workspaceSearchParams,
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
      console.error('Error in workspaces API:', error);
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
