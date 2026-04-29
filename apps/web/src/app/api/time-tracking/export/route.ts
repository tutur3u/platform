import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  getGroupedSessionsPaginated,
  type PaginationParams,
} from '@/lib/time-tracking-helper';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is root user
    const isRootUser = user.email?.endsWith('@tuturuuu.com');
    if (!isRootUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const wsId = searchParams.get('wsId') || ROOT_WORKSPACE_ID;

    // Check if workspace is root workspace
    const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;
    if (!isRootWorkspace) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse remaining query parameters
    const period =
      (searchParams.get('period') as 'day' | 'week' | 'month') || 'day';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    // Validate workspace access
    const workspaceMember = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (workspaceMember.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!workspaceMember.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Prepare pagination parameters
    const params: PaginationParams = {
      page,
      limit: Math.min(limit, 1000), // Cap at 1000 records per request
      search: search || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };

    // Fetch paginated sessions
    const result = await getGroupedSessionsPaginated(wsId, period, params);

    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
