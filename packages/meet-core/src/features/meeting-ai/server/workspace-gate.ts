import { MEETING_APP } from '@tuturuuu/meet-core/runtime';

/**
 * Meet AI pilot gate. A workspace may start or feed transcription and notes only
 * when its id appears in MEET_AI_ENABLED_WORKSPACE_IDS (comma or whitespace
 * separated). Unset, empty or unlisted denies; there is no wildcard, so widening
 * the pilot is always an explicit configuration change.
 */
export const MEET_AI_WORKSPACE_ALLOWLIST_ENV = 'MEET_AI_ENABLED_WORKSPACE_IDS';

export function meetAiEnabledWorkspaceIds(
  env: Record<string, string | undefined> = process.env
) {
  return new Set(
    (env[MEET_AI_WORKSPACE_ALLOWLIST_ENV] ?? '')
      .split(/[\s,]+/)
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isMeetAiEnabledForWorkspace(
  wsId: string,
  env?: Record<string, string | undefined>
) {
  return meetAiEnabledWorkspaceIds(env).has(wsId.toLowerCase());
}

/** Parley scenario sessions are a separate product and are not part of the pilot. */
export function isMeetAiAvailableForWorkspace(wsId: string) {
  return MEETING_APP === 'parley' || isMeetAiEnabledForWorkspace(wsId);
}
