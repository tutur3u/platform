import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  cloudflareDomainsConfigFromEnv,
  createCloudflareDomainsClient,
} from './cloudflare';
import type { WorkspaceDomainActor } from './entitlement';
import {
  addWorkspaceDomain,
  listWorkspaceDomains,
  removeWorkspaceDomain,
  verifyWorkspaceDomain,
  WorkspaceDomainError,
  type WorkspaceDomainDeps,
} from './service';

type Action = 'list' | 'add' | 'verify' | 'remove';
type Params = { wsId: string; domainId?: string };

const addSchema = z.object({ hostname: z.string().trim().min(1).max(300) });
const NO_STORE = { 'Cache-Control': 'no-store' };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** Staff status from the current Auth record, never a JWT projection. */
async function resolveActor(
  admin: TypedSupabaseClient,
  userId: string
): Promise<WorkspaceDomainActor> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  return {
    id: userId,
    staffSession:
      !error && data.user?.id === userId
        ? isVerifiedTuturuuuStaffSession(data.user, { allowXwf: false })
        : false,
  };
}

async function handle(
  request: NextRequest,
  userId: string,
  user: Parameters<typeof getPermissions>[0]['user'],
  params: Params,
  action: Action
) {
  await connection();
  const permissions = await getPermissions({
    wsId: params.wsId,
    user,
    request,
  });
  if (!permissions) return json({ error: 'workspace_forbidden' }, 403);
  const canManage = permissions.containsPermission('manage_workspace_domains');
  const canView =
    canManage || permissions.containsPermission('view_workspace_domains');
  if (action === 'list' ? !canView : !canManage) {
    return json({ error: 'workspace_domains_forbidden' }, 403);
  }

  const wsId = permissions.wsId;
  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const config = cloudflareDomainsConfigFromEnv();
  const deps: WorkspaceDomainDeps = {
    admin,
    cloudflare: config ? createCloudflareDomainsClient(config) : null,
  };
  const actor = await resolveActor(admin, userId);

  try {
    if (action === 'list') {
      return json({
        ...(await listWorkspaceDomains(deps, wsId, actor)),
        canManage,
      });
    }
    if (action === 'add') {
      const body = addSchema.safeParse(await request.json().catch(() => null));
      if (!body.success) return json({ error: 'invalid_request' }, 400);
      return json(
        {
          domain: await addWorkspaceDomain(
            deps,
            wsId,
            actor,
            body.data.hostname
          ),
        },
        201
      );
    }
    const domainId = z.uuid().safeParse(params.domainId);
    if (!domainId.success) return json({ error: 'invalid_request' }, 400);
    if (action === 'verify') {
      return json({
        domain: await verifyWorkspaceDomain(deps, wsId, actor, domainId.data),
      });
    }
    return json(await removeWorkspaceDomain(deps, wsId, actor, domainId.data));
  } catch (error) {
    if (error instanceof WorkspaceDomainError) {
      return json({ error: error.code }, error.status);
    }
    console.error('workspace-domains: request failed', {
      action,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'domains_unavailable' }, 503);
  }
}

/** Route handler factory for /api/v1/workspaces/:wsId/domains[/...]. */
export function workspaceDomainsRoute(action: Action) {
  return withSessionAuth<Params>(
    async (request, { user }, params) =>
      handle(request, user.id, user, params, action),
    { rateLimitKind: action === 'list' ? 'read' : 'mutate' }
  );
}
