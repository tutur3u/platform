import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

function isSupabaseGatewayHtmlError(error: {
  code?: string | null;
  message?: string | null;
}) {
  const message = error.message ?? '';

  return (
    message.includes('<!DOCTYPE html>') &&
    /Error code 502|502: Bad gateway|Bad gateway/i.test(message)
  );
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const { searchParams } = new URL(req.url);
  const featuredGroupIds = searchParams.getAll('featuredGroupIds');
  const excludedGroups = searchParams.getAll('excludedGroups');
  const searchQuery = searchParams.get('q') || undefined;
  const status = searchParams.get('status') || 'active';
  const linkStatus = searchParams.get('linkStatus') || 'all';

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (featuredGroupIds.length === 0) {
    return NextResponse.json({});
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin.rpc('get_featured_group_counts', {
    _ws_id: wsId,
    _featured_group_ids: featuredGroupIds,
    _excluded_groups: excludedGroups,
    _search_query: searchQuery,
    _status: status,
    _link_status: linkStatus,
  });

  if (error) {
    if (isSupabaseGatewayHtmlError(error)) {
      console.warn('Featured group counts temporarily unavailable:', {
        wsId,
        featuredGroupCount: featuredGroupIds.length,
      });

      return NextResponse.json(
        Object.fromEntries(featuredGroupIds.map((groupId) => [groupId, 0]))
      );
    }

    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching featured group counts' },
      { status: 500 }
    );
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.group_id] = Number(row.user_count);
  }

  return NextResponse.json(counts);
}
