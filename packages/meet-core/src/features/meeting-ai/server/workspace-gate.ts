import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  MEET_AI_DISABLED_ENV,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';

export {
  isMeetAiEnabledForWorkspace,
  MEET_AI_WORKSPACE_ALLOWLIST_ENV,
  type MeetAiGateEnv,
  meetAiEnabledWorkspaceIds,
} from '@tuturuuu/realtime/meet';

/**
 * The raw Worker env binding, never ambient process.env, or undefined when no
 * Cloudflare context exists. Only adapters that own a non-Worker fallback (the
 * apps/web legacy gate) use this; Meet code uses meetAiGateEnv().
 */
export async function meetAiWorkerEnv(): Promise<MeetAiGateEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as MeetAiGateEnv;
  } catch {
    return undefined;
  }
}

/**
 * The Worker env binding for the Meet AI gate. Without a Cloudflare context
 * the gate fails closed, as if the kill switch were on, so a missing binding
 * can never open Meet AI.
 */
export async function meetAiGateEnv(): Promise<MeetAiGateEnv> {
  return (await meetAiWorkerEnv()) ?? { [MEET_AI_DISABLED_ENV]: 'true' };
}

/** Workspace-wide generation requires an authoritative attestation store. */
export function isMeetAiAvailableForWorkspace(
  _wsId: string | null | undefined,
  _env: MeetAiGateEnv
) {
  return false;
}

export async function meetAiAvailable(wsId: string | null | undefined) {
  return isMeetAiAvailableForWorkspace(wsId, await meetAiGateEnv());
}
