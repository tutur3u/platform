import 'server-only';

import {
  createRuntimeReader,
  type PrivateRpcResult,
  resolveRuntimeFlagEnvironment,
} from '@tuturuuu/feature-flags';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

/** Runtime flag for the TanStack DB board sync pilot (catalog key). */
export const INSTANT_BOARD_SYNC_FLAG = 'TASKS_INSTANT_BOARD_SYNC';

interface AbortablePrivateRpcAdmin {
  schema: (name: 'private') => {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => {
      abortSignal: (signal: AbortSignal) => PromiseLike<PrivateRpcResult>;
    };
  };
}

// One service client per isolate; each call carries its own abort signal.
let adminClient: Promise<AbortablePrivateRpcAdmin> | undefined;

function getAdminClient(): Promise<AbortablePrivateRpcAdmin> {
  if (adminClient) return adminClient;
  const pending = (async () =>
    (await createAdminClient({
      noCookie: true,
    })) as unknown as AbortablePrivateRpcAdmin)();
  adminClient = pending;
  pending.catch(() => {
    if (adminClient === pending) adminClient = undefined;
  });
  return pending;
}

const reader = createRuntimeReader({
  rpc: async (name, args, signal) =>
    (await getAdminClient())
      .schema('private')
      .rpc(name, args)
      .abortSignal(signal),
  readEnv: (name) => process.env[name],
});

/**
 * Pilot flag for TanStack DB board sync. The flag declares only the platform
 * scope, so evaluation reads the per-isolate cached platform snapshot and makes
 * no per-request query; a `rollout` platform rule allow-lists pilot workspaces.
 * Off by default, and off on any evaluation failure.
 */
export async function isInstantBoardSyncEnabled({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  try {
    const decision = await reader.evaluateFlag(INSTANT_BOARD_SYNC_FLAG, {
      environment: resolveRuntimeFlagEnvironment({
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      }),
      userId,
      workspaceId,
      isStaff: false,
    });
    return decision.enabled;
  } catch (error) {
    console.warn('Instant board sync flag evaluation failed:', error);
    return false;
  }
}
