import 'server-only';

import { meetAiWorkerEnv } from '@tuturuuu/meet-core/features/meeting-ai/server/workspace-gate';
import {
  isMeetAiEnabledForWorkspace,
  MEET_AI_DISABLED_ENV,
  MEET_AI_PROTECTED_WORKSPACES_ENV,
  MEET_AI_WORKSPACE_ALLOWLIST_ENV,
  MEET_AI_WORKSPACE_DENYLIST_ENV,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';

/**
 * Vercel has no Worker binding and uses server env; an injected binding wins
 * per control, even if malformed. Either way the shared gate is default-off:
 * without an explicit allowlist entry every workspace is denied, and Easy
 * Center is denied through the protected-workspace secret.
 */
function resolveGateEnv(binding: MeetAiGateEnv): MeetAiGateEnv {
  return Object.fromEntries(
    [
      MEET_AI_DISABLED_ENV,
      MEET_AI_PROTECTED_WORKSPACES_ENV,
      MEET_AI_WORKSPACE_DENYLIST_ENV,
      MEET_AI_WORKSPACE_ALLOWLIST_ENV,
    ].map((name) => [
      name,
      binding && Object.hasOwn(binding, name)
        ? Reflect.get(binding, name)
        : process.env[name],
    ])
  );
}

export async function isMeetAiEnabledOnWeb(wsId: string | null | undefined) {
  return isMeetAiEnabledForWorkspace(
    wsId,
    resolveGateEnv(await meetAiWorkerEnv())
  );
}
