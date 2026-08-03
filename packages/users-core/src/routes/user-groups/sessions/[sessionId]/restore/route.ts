import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { restoreUserGroupSession } from '@tuturuuu/users-core/lib/user-groups/session-schedule';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ sessionId: string; wsId: string }>;
}

export async function POST(req: Request, { params }: Params) {
  const { sessionId, wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);
  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group sessions' },
      { status: 403 }
    );
  }

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const data = await restoreUserGroupSession({
      sessionId,
      supabase,
      wsId: normalizedWsId,
    });
    if (!data) {
      return NextResponse.json(
        { message: 'User group session not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ data, message: 'success' });
  } catch (error) {
    console.error('Failed to restore user group session', { error });
    return NextResponse.json(
      { message: 'Failed to restore user group session' },
      { status: 500 }
    );
  }
}
