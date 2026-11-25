import { NextResponse } from 'next/server';
import {
  loadExternalAppWorkspaceMemberListV2,
  parseMemberListRequest,
} from '@/lib/external-apps/workspace-member-list-v2';
import {
  externalAppWorkspaceMemberScopes,
  loadExternalAppWorkspaceMembers,
  requireExternalAppWorkspaceMembersAccess,
} from '@/lib/external-apps/workspace-members';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [
  externalAppWorkspaceMemberScopes.membersRead,
  externalAppWorkspaceMemberScopes.rolesRead,
];

/**
 * v1 (no `version`) keeps its body. `?version=2` adds membership types,
 * revisions, pagination and the `complete` marker; see
 * `@/lib/external-apps/workspace-member-list-v2`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireExternalAppWorkspaceMembersAccess({
    request,
    requiredScopes,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  // Validate the query only after authorization, so unauthenticated callers
  // see the same 401/403 whatever they send.
  const listRequest = parseMemberListRequest(request);

  if (listRequest instanceof NextResponse) {
    return listRequest;
  }

  if (listRequest.version === 2) {
    const response = await loadExternalAppWorkspaceMemberListV2(
      access,
      listRequest
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  return NextResponse.json(await loadExternalAppWorkspaceMembers(access));
}
