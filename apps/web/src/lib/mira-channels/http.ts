import 'server-only';
import type { MiraRpcClient } from '@tuturuuu/internal-api/mira-channels-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { type MiraTenantAction, runMiraTenantAction } from './service';

type Params = { wsId: string; channel?: string };

const NO_STORE = { 'Cache-Control': 'no-store' };

// Mira view and manage map to the AI agent deployment permissions that the
// channel runtime builds on.
export const MIRA_MANAGE_PERMISSION = 'manage_ai_agents';
export const MIRA_VIEW_PERMISSION = 'view_ai_usage';

async function handle(
  request: NextRequest,
  user: Parameters<typeof getPermissions>[0]['user'],
  params: Params,
  action: MiraTenantAction
) {
  await connection();
  const permissions = await getPermissions({
    wsId: params.wsId,
    user,
    request,
  });
  if (!permissions || !user) {
    return NextResponse.json(
      { error: 'workspace_forbidden' },
      { status: 403, headers: NO_STORE }
    );
  }
  const canManage = permissions.containsPermission(MIRA_MANAGE_PERMISSION);
  const canView =
    canManage || permissions.containsPermission(MIRA_VIEW_PERMISSION);

  const hasBody =
    action === 'settings' || action === 'stop' || action === 'connect';
  const body = hasBody ? await request.json().catch(() => null) : undefined;

  const result = await runMiraTenantAction(
    {
      rpc: (await createAdminClient()) as unknown as MiraRpcClient,
      // Provider proof verifiers and the vault purger are wired with the
      // channel Worker and the vault workload tier; until then connect
      // answers connect_unavailable and unbinding a channel that still
      // names vault secrets answers vault_unavailable.
      verifiers: {},
      purgeSecrets: null,
      today: () => new Date().toISOString().slice(0, 10),
    },
    {
      wsId: permissions.wsId,
      actor: { id: user.id, canManage, canView },
      action,
      body,
      channel: params.channel,
      searchParams: request.nextUrl.searchParams,
    }
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: NO_STORE,
  });
}

/** Route handler factory for /api/v1/workspaces/:wsId/mira[/...]. */
export function miraTenantRoute(action: MiraTenantAction) {
  return withSessionAuth<Params>(
    async (request, { user }, params) => handle(request, user, params, action),
    {
      rateLimitKind: action === 'get' || action === 'usage' ? 'read' : 'mutate',
    }
  );
}
