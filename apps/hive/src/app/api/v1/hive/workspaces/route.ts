import { fetchWorkspaceSummaries } from '@tuturuuu/ui/lib/workspace-actions';
import { type NextRequest, NextResponse } from 'next/server';
import { getHivePersonalWorkspaceId } from '@/lib/hive/ai';
import { requireHiveAccess, withHiveRoute } from '../_shared';

const ROUTE = '/api/v1/hive/workspaces';

export async function GET(request: NextRequest) {
  return withHiveRoute(request, ROUTE, async () => {
    const result = await requireHiveAccess(request);
    if (!result.ok) return result.response;

    try {
      const [workspaces, personalWorkspaceId] = await Promise.all([
        fetchWorkspaceSummaries({
          requireAuth: true,
          supabase: result.access.sbAdmin,
          userId: result.access.user.id,
        }),
        getHivePersonalWorkspaceId({
          sbAdmin: result.access.sbAdmin,
          userId: result.access.user.id,
        }).catch(() => null),
      ]);

      return NextResponse.json({ personalWorkspaceId, workspaces });
    } catch (error) {
      console.error('Failed to list Hive workspaces', {
        error: error instanceof Error ? error.message : String(error),
        userId: result.access.user.id,
      });
      return NextResponse.json(
        { error: 'Failed to list Hive workspaces' },
        { status: 500 }
      );
    }
  });
}
