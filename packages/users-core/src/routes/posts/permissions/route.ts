import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { getUserGroupRoutePermissions } from '../../../lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '../../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const [permissions, rootPermissions] = await Promise.all([
    getUserGroupRoutePermissions(wsId, request),
    getUserGroupRoutePermissions(ROOT_WORKSPACE_ID, request),
  ]);

  return NextResponse.json({
    canApprovePosts: permissions?.containsPermission('approve_posts') ?? false,
    canForceSendPosts:
      rootPermissions?.containsPermission('manage_workspace_roles') ?? false,
  });
}
