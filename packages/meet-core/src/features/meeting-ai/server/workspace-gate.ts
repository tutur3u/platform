import { getCloudflareContext } from '@opennextjs/cloudflare';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import {
  isMeetAiEnabledForWorkspace,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';

export {
  isMeetAiEnabledForWorkspace,
  MEET_AI_WORKSPACE_ALLOWLIST_ENV,
  type MeetAiGateEnv,
  meetAiEnabledWorkspaceIds,
} from '@tuturuuu/realtime/meet';

/**
 * The Worker env binding, never ambient process.env. Without a Cloudflare
 * context the default policy allows; credit admission still applies.
 */
export async function meetAiGateEnv(): Promise<MeetAiGateEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as MeetAiGateEnv;
  } catch {
    return undefined;
  }
}

/** Parley scenario sessions are a separate product and are not part of the Meet gate. */
export function isMeetAiAvailableForWorkspace(
  wsId: string | null | undefined,
  env: MeetAiGateEnv
) {
  return MEETING_APP === 'parley' || isMeetAiEnabledForWorkspace(wsId, env);
}

export async function meetAiAvailable(wsId: string | null | undefined) {
  return isMeetAiAvailableForWorkspace(wsId, await meetAiGateEnv());
}
