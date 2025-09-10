import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
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
