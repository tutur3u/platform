import 'server-only';
import type { MiraRpcClient } from '@tuturuuu/internal-api/mira-channels-rpc';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const MIRA_OPERATOR_PERMISSION = 'operate_mira_channels';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function miraJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Operator routes run only on the Admin session (the Admin proxy enforces MFA
 * assurance). Bearer and scheduled callers are refused before any lookup, and
 * the caller needs root admin plus the explicit-grant operator permission,
 * which creators, admin and default permissions never imply.
 */
export async function authorizeMiraOperator(request: Request) {
  if (request.headers.has('authorization')) {
    return {
      ok: false as const,
      response: miraJson({ error: 'unauthorized' }, 401),
    };
  }
  const actor = await resolveSatelliteRequestActor(request, 'infra');
  if (!actor) {
    return {
      ok: false as const,
      response: miraJson({ error: 'unauthorized' }, 401),
    };
  }
  const permissions = await getPermissions({
    user: actor.user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (
    !permissions ||
    permissions.withoutPermission('admin') ||
    permissions.withoutPermission(MIRA_OPERATOR_PERMISSION)
  ) {
    return {
      ok: false as const,
      response: miraJson({ error: 'forbidden' }, 403),
    };
  }
  return {
    ok: true as const,
    actorId: actor.user.id,
    rpc: actor.admin as unknown as MiraRpcClient,
  };
}
