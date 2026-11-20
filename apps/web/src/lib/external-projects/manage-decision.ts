import { getBearerAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';
import { requireWorkspaceExternalProjectAccessWithAppToken } from './access';
import { hasWorkspaceExternalProjectPermission } from './access-mode';

function deny(error: string, status: 401 | 403) {
  return {
    ok: false as const,
    response: NextResponse.json({ error }, { status }),
  };
}

/** Live grant for a workspace-bound external app bearer. */
export async function requireWorkspaceExternalProjectManageDecision(
  request: Request,
  wsId: string
) {
  if (!validateUUID(wsId)) return deny('Forbidden', 403);
  const token = getBearerAppCoordinationToken(request);
  if (!token) return deny('Unauthorized', 401);

  const access = await requireWorkspaceExternalProjectAccessWithAppToken({
    mode: 'manage',
    exactManage: true,
    token,
    wsId,
  });
  if (!access.ok) return access;
  if (
    access.normalizedWorkspaceId !== wsId ||
    !hasWorkspaceExternalProjectPermission(
      access.workspacePermissions,
      'manage'
    )
  ) {
    return deny('Forbidden', 403);
  }

  return {
    ok: true as const,
    decision: {
      decision: 'allow' as const,
      actorId: access.user.id,
      workspaceId: access.normalizedWorkspaceId,
      scopes: ['external-projects:manage'] as const,
    },
  };
}
