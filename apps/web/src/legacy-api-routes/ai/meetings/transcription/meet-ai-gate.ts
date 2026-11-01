import 'server-only';

import { meetAiGateEnv } from '@tuturuuu/meet-core/features/meeting-ai/server/workspace-gate';
import {
  isMeetAiEnabledForWorkspace,
  MEET_AI_DISABLED_ENV,
  MEET_AI_WORKSPACE_ALLOWLIST_ENV,
  MEET_AI_WORKSPACE_DENYLIST_ENV,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';

/** Vercel uses server env; an injected binding wins per control, even if malformed. */
function resolveGateEnv(binding: MeetAiGateEnv): MeetAiGateEnv {
  return Object.fromEntries(
    [
      MEET_AI_DISABLED_ENV,
      MEET_AI_WORKSPACE_DENYLIST_ENV,
      MEET_AI_WORKSPACE_ALLOWLIST_ENV,
    ].map((name) => [
      name,
      binding && name in binding
        ? Reflect.get(binding, name)
        : process.env[name],
    ])
  );
}

export async function isMeetAiEnabledOnWeb(wsId: string | null | undefined) {
  return isMeetAiEnabledForWorkspace(
    wsId,
    resolveGateEnv(await meetAiGateEnv())
  );
}
