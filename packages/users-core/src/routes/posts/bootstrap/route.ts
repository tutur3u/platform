import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { buildDefaultPostsDateRange } from '../../../lib/posts/date-range';
import { getUserGroupRoutePermissions } from '../../../lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '../../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const actorId = await resolveRequestActorAuthUid(request);
  if (!actorId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let wsId: string;
  try {
    wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  } catch {
    return NextResponse.json(
      { message: 'Workspace not found' },
      { status: 404 }
    );
  }

  const permissions = await getUserGroupRoutePermissions(wsId, request);
  if (!permissions) {
    return NextResponse.json(
      { message: 'Workspace not found' },
      { status: 404 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: workspace, error } = await sbAdmin
    .from('workspaces')
    .select('id, timezone')
    .eq('id', wsId)
    .maybeSingle();

  if (error) {
    console.error('Error loading workspace Posts bootstrap', { error, wsId });
    return NextResponse.json(
      { message: 'Error fetching workspace' },
      { status: 500 }
    );
  }
  if (!workspace) {
    return NextResponse.json(
      { message: 'Workspace not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    defaultDateRange: buildDefaultPostsDateRange(workspace.timezone),
    wsId: workspace.id,
  });
}
