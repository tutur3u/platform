import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { listUserGroupScheduleGroupSummaries } from '@tuturuuu/users-core/lib/user-groups/session-schedule';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_GROUP_SUMMARY_IDS = 100;

const QuerySchema = z.object({
  from: z.string().datetime(),
  groupIds: z.array(z.string().uuid()).max(MAX_GROUP_SUMMARY_IDS),
  timezone: z.string().trim().min(1).max(128).default(DEFAULT_TIMEZONE),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

function readGroupIds(value: string | null) {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getPermissions({ request: req, wsId });
  if (!permissions) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group sessions' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: url.searchParams.get('from'),
    groupIds: readGroupIds(url.searchParams.get('groupIds')),
    timezone: url.searchParams.get('timezone') ?? DEFAULT_TIMEZONE,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request query', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  if (parsed.data.groupIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const data = await listUserGroupScheduleGroupSummaries({
      from: parsed.data.from,
      groupIds: parsed.data.groupIds,
      supabase,
      timezone: parsed.data.timezone,
      wsId: normalizedWsId,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to list user group schedule summaries', {
      error,
    });
    return NextResponse.json(
      { message: 'Failed to list user group schedule summaries' },
      { status: 500 }
    );
  }
}
