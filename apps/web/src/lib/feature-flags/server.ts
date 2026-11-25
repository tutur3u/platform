import 'server-only';

import {
  asPrivateRpcAdmin,
  createRuntimeReader,
  isInternalFeatureAudience,
  isUuid,
  readRuntimePlatformSnapshot,
  resolveRuntimeFlagEnvironment,
  type RuleEnvironment,
} from '@tuturuuu/feature-flags';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

async function rpc(
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal
) {
  const admin = asPrivateRpcAdmin(
    await createAdminClient({
      noCookie: true,
      fetch: (input, init) => fetch(input, { ...init, signal }),
    })
  );
  return admin.schema('private').rpc(name, args);
}

const reader = createRuntimeReader({
  rpc,
  readEnv: (name) => process.env[name],
});

export function loadPlatformFeatureFlagSnapshot(environment: RuleEnvironment) {
  return readRuntimePlatformSnapshot(rpc, environment);
}

async function resolveActor(request?: Pick<Request, 'headers' | 'url'>) {
  if (request) {
    const session = await resolveSessionAuthContext(request);
    return session.ok ? session : null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : { user: data.user, supabase };
}

export async function isFeatureEnabled(
  key: string,
  context: {
    request?: Pick<Request, 'headers' | 'url'>;
    workspaceId?: string;
  } = {}
): Promise<boolean> {
  await connection();
  try {
    const actor = await resolveActor(context.request);
    if (!actor) return false;

    let workspaceId: string | null = null;
    if (context.workspaceId !== undefined) {
      if (!isUuid(context.workspaceId)) return false;
      workspaceId = context.workspaceId.toLowerCase();
      const membership = await verifyWorkspaceMembershipType({
        supabase: actor.supabase,
        userId: actor.user.id,
        wsId: workspaceId,
        requiredType: 'ANY',
      });
      if (!membership.ok) return false;
    }

    const decision = await reader.evaluateFlag(key, {
      environment: resolveRuntimeFlagEnvironment({
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      }),
      userId: actor.user.id,
      workspaceId,
      isStaff: isInternalFeatureAudience(actor.user),
    });
    return decision.enabled;
  } catch {
    return false;
  }
}
