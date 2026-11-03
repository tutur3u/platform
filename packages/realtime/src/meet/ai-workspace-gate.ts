/**
 * Runtime-injected, server-only Meet AI controls. Credit admission is separate.
 *
 * Meet AI is DEFAULT-OFF: a workspace is allowed only when it is listed by id
 * in MEET_AI_ENABLED_WORKSPACE_IDS and nothing else denies it. Evaluation
 * order, first match wins:
 *   1. missing workspace id                          -> deny
 *   2. protected config missing/invalid or id listed -> deny
 *   3. MEET_AI_DISABLED present and not 0/false      -> deny every workspace
 *   4. MEET_AI_DISABLED_WORKSPACE_IDS malformed      -> deny every workspace
 *      or listing the workspace                      -> deny
 *   5. MEET_AI_ENABLED_WORKSPACE_IDS missing, empty,
 *      non-string, '*' or with any non-UUID entry    -> deny every workspace
 *   6. the workspace id is listed in the allowlist   -> allow
 *
 * '*' is NOT an allow-all value. It denies and is logged; an allow-all switch
 * would need its own, separately reviewed opt-in.
 */
export const MEET_AI_WORKSPACE_ALLOWLIST_ENV = 'MEET_AI_ENABLED_WORKSPACE_IDS';
export const MEET_AI_DISABLED_ENV = 'MEET_AI_DISABLED';
export const MEET_AI_WORKSPACE_DENYLIST_ENV = 'MEET_AI_DISABLED_WORKSPACE_IDS';

export const MEET_AI_PROTECTED_WORKSPACES_ENV =
  'MEET_AI_PROTECTED_WORKSPACE_IDS';

export type MeetAiGateEnv = object | null | undefined;

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function binding(env: MeetAiGateEnv, name: string): unknown {
  return env && Object.hasOwn(env, name) ? Reflect.get(env, name) : undefined;
}

function workspaceIds(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((id) => id.toLowerCase())
    .filter(Boolean);
}

const warned = new Set<string>();
/** One log line per distinct misconfiguration per isolate; never logs ids. */
function warnOnce(reason: string) {
  if (warned.has(reason)) return;
  warned.add(reason);
  console.warn(
    `[meet-ai-gate] ${reason}; Meet AI is denied for every workspace`
  );
}

/** Test hook: forget which misconfigurations were already logged. */
export function resetMeetAiGateWarnings() {
  warned.clear();
}

/**
 * The explicitly allowed workspace ids. Empty (deny all) when the allowlist is
 * missing, not a string, blank, '*' or contains any entry that is not a UUID.
 */
export function meetAiEnabledWorkspaceIds(env: MeetAiGateEnv) {
  const raw = binding(env, MEET_AI_WORKSPACE_ALLOWLIST_ENV);
  if (typeof raw !== 'string') {
    if (raw !== undefined)
      warnOnce(`${MEET_AI_WORKSPACE_ALLOWLIST_ENV} is not a string`);
    return new Set<string>();
  }
  const ids = workspaceIds(raw);
  if (ids.includes('*')) {
    warnOnce(
      `${MEET_AI_WORKSPACE_ALLOWLIST_ENV} contains '*', which is not an allow-all value`
    );
    return new Set<string>();
  }
  if (ids.some((id) => !UUID.test(id))) {
    warnOnce(`${MEET_AI_WORKSPACE_ALLOWLIST_ENV} contains a non-UUID entry`);
    return new Set<string>();
  }
  return new Set(ids);
}

/**
 * Hard denies apply to Meet and Parley; only pilot lists may be bypassed.
 * Accept only canonical database UUIDs, never normalize a request identity.
 */
export function isMeetAiHardDenied(
  wsId: string | null | undefined,
  env: MeetAiGateEnv
) {
  const id = typeof wsId === 'string' ? wsId : '';
  if (id.length !== 36 || !UUID.test(id)) return true;
  const protectedRaw = binding(env, MEET_AI_PROTECTED_WORKSPACES_ENV);
  if (typeof protectedRaw !== 'string') return true;
  const protectedIds = workspaceIds(protectedRaw);
  if (!protectedIds.length || protectedIds.some((entry) => !UUID.test(entry)))
    return true;
  if (protectedIds.includes(id)) return true;
  const disabled = binding(env, MEET_AI_DISABLED_ENV);
  return (
    disabled !== undefined &&
    (typeof disabled !== 'string' ||
      !['0', 'false'].includes(disabled.trim().toLowerCase()))
  );
}

export function isMeetAiEnabledForWorkspace(
  wsId: string | null | undefined,
  env: MeetAiGateEnv
) {
  if (isMeetAiHardDenied(wsId, env)) return false;
  const id = typeof wsId === 'string' ? wsId : '';

  const denied = binding(env, MEET_AI_WORKSPACE_DENYLIST_ENV);
  if (denied !== undefined) {
    if (typeof denied !== 'string') {
      warnOnce(`${MEET_AI_WORKSPACE_DENYLIST_ENV} is not a string`);
      return false;
    }
    const ids = workspaceIds(denied);
    if (ids.some((entry) => !UUID.test(entry))) {
      warnOnce(`${MEET_AI_WORKSPACE_DENYLIST_ENV} contains a non-UUID entry`);
      return false;
    }
    if (ids.includes(id)) return false;
  }

  return meetAiEnabledWorkspaceIds(env).has(id);
}
