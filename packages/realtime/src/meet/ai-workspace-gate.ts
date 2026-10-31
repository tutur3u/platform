/**
 * Meet AI pilot gate. A workspace may use Meet AI (transcription, notes, the
 * live assistant and note sharing) only when its server-resolved id appears in
 * MEET_AI_ENABLED_WORKSPACE_IDS (comma or whitespace separated). Unset, empty or
 * unlisted denies. There is no wildcard, so widening the pilot is always an
 * explicit configuration change.
 *
 * The binding is injected by each runtime (Worker env, Durable Object env) and is
 * never read from ambient `process.env`: a runtime that supplies no binding denies
 * even if some other process happens to define the variable.
 */
export const MEET_AI_WORKSPACE_ALLOWLIST_ENV = 'MEET_AI_ENABLED_WORKSPACE_IDS';

export type MeetAiGateEnv =
  | { readonly MEET_AI_ENABLED_WORKSPACE_IDS?: unknown }
  | null
  | undefined;

export function meetAiEnabledWorkspaceIds(env: MeetAiGateEnv) {
  const raw = env?.MEET_AI_ENABLED_WORKSPACE_IDS;
  return new Set(
    (typeof raw === 'string' ? raw : '')
      .split(/[\s,]+/)
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isMeetAiEnabledForWorkspace(
  wsId: string | null | undefined,
  env: MeetAiGateEnv
) {
  return !!wsId && meetAiEnabledWorkspaceIds(env).has(wsId.toLowerCase());
}
