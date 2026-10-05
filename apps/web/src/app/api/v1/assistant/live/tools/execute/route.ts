import { createMiraStreamTools } from '@tuturuuu/ai/tools/mira-tools';
import { resolveWorkspaceContextState } from '@tuturuuu/ai/tools/workspace-context';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { validateAiTempAuthRequest } from '@tuturuuu/utils/ai-temp-auth';
import {
  getPermissions,
  getWorkspaceTier,
  normalizeWorkspaceId,
  resolveWorkspaceIdForPrincipal,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { isFeatureAvailable } from '@/lib/feature-tiers';
import { runCanonicalLiveTool } from '@/lib/live/canonical-tool-bridge';

const inputSchema = z.object({
  wsId: z.string().min(1).max(128),
  functionName: z.enum(['search_workspace_tools', 'execute_workspace_tool']),
  args: z.record(z.string(), z.unknown()),
  toolCallId: z.string().min(1).max(256),
});
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The canonical factory remains the permission and dispatch boundary. */
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid Live tool request' }, 400);
  try {
    let supabase = await createClient(request);
    const tempAuth = await validateAiTempAuthRequest(request);
    if (tempAuth.status === 'revoked')
      return json({ error: 'Unauthorized' }, 401);
    const user =
      tempAuth.status === 'valid'
        ? tempAuth.context.user
        : (await resolveAuthenticatedSessionUser(supabase)).user;
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (tempAuth.status === 'valid')
      supabase = await createAdminClient({ noCookie: true });
    const principal = { id: user.id, email: user.email ?? null };
    const wsId =
      tempAuth.status === 'valid'
        ? await resolveWorkspaceIdForPrincipal({
            authorizationClient: supabase,
            principal,
            wsId: parsed.data.wsId,
          })
        : await normalizeWorkspaceId(parsed.data.wsId, supabase);
    if (
      tempAuth.status === 'valid' &&
      tempAuth.context.wsId &&
      tempAuth.context.wsId !== wsId
    )
      return json({ error: 'Workspace access denied' }, 403);
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });
    if (membership.error === 'membership_lookup_failed')
      return json({ error: 'Workspace verification unavailable' }, 503);
    if (!membership.ok) return json({ error: 'Workspace access denied' }, 403);
    const tier = await getWorkspaceTier(wsId, { useAdmin: true });
    if (!isFeatureAvailable('voice_assistant', tier))
      return json(
        { error: 'Voice Assistant requires PRO tier or higher' },
        403
      );
    const [workspaceContext, permissions] = await Promise.all([
      resolveWorkspaceContextState({
        supabase,
        userId: user.id,
        requestedWorkspaceContextId: wsId,
        strict: true,
      }),
      getPermissions({ wsId, user: principal }),
    ]);
    if (!permissions)
      return json({ error: 'Workspace permissions unavailable' }, 503);
    const tools = createMiraStreamTools(
      {
        userId: user.id,
        wsId,
        workspaceContext,
        supabase,
        requestHeaders: request.headers,
        // Live has no negotiated workspace switch. Never reuse current-workspace
        // permissions for a registry operation targeting another workspace.
        authorizeWorkspaceTools: async (targetWsId, required) => {
          if (targetWsId !== wsId) return false;
          return required.every(
            (permission) => !permissions.withoutPermission(permission)
          );
        },
      },
      permissions.withoutPermission
    );
    const result = await runCanonicalLiveTool(
      tools,
      parsed.data.functionName,
      parsed.data.args,
      parsed.data.toolCallId
    );
    return json({ result });
  } catch {
    // Canonical handlers can contain private provider errors. Never echo them.
    console.error('Canonical Live tool execution failed');
    return json({ error: 'Live tool execution unavailable' }, 500);
  }
}
