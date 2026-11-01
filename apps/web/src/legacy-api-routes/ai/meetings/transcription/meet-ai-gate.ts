import 'server-only';

import { meetAiGateEnv } from '@tuturuuu/meet-core/features/meeting-ai/server/workspace-gate';
import {
  isMeetAiEnabledForWorkspace,
  MEET_AI_WORKSPACE_ALLOWLIST_ENV,
  type MeetAiGateEnv,
} from '@tuturuuu/realtime/meet';

/**
 * Vercel has no Cloudflare Worker binding, so the allowlist comes from the
 * server-only MEET_AI_ENABLED_WORKSPACE_IDS env var (never client-exposed, never
 * exported to client code). A Cloudflare binding, when one is set, wins. Parsing
 * and matching are the shared Meet gate helpers: no wildcard, unset or blank
 * denies.
 */
function resolveAllowlistEnv(binding: MeetAiGateEnv): MeetAiGateEnv {
  const bound = (binding as Record<string, unknown> | null | undefined)?.[
    MEET_AI_WORKSPACE_ALLOWLIST_ENV
  ];
  if (typeof bound === 'string') return binding;
  return {
    [MEET_AI_WORKSPACE_ALLOWLIST_ENV]:
      process.env[MEET_AI_WORKSPACE_ALLOWLIST_ENV],
  };
}

export async function isMeetAiEnabledOnWeb(wsId: string | null | undefined) {
  return isMeetAiEnabledForWorkspace(
    wsId,
    resolveAllowlistEnv(await meetAiGateEnv())
  );
}
