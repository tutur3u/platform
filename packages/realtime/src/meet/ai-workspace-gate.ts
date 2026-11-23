/**
 * Runtime-injected, server-only Meet AI controls. Credit admission is separate.
 *
 * The Meet production Worker opts every eligible workspace in. Other runtimes
 * use their own injected controls. The operator kill secret, exact enable
 * binding, canonical workspace identity, protected list and denylist all take
 * precedence over the rollout controls. Invalid configuration denies access.
 */
export const MEET_AI_WORKSPACE_ALLOWLIST_ENV = 'MEET_AI_ENABLED_WORKSPACE_IDS';
export const MEET_AI_DISABLED_ENV = 'MEET_AI_DISABLED';
export const MEET_AI_KILL_SWITCH_ENV = 'MEET_AI_KILL_SWITCH';
export const MEET_AI_WORKSPACE_DENYLIST_ENV = 'MEET_AI_DISABLED_WORKSPACE_IDS';

export const MEET_AI_PROTECTED_WORKSPACES_ENV =
  'MEET_AI_PROTECTED_WORKSPACE_IDS';

/** Reviewed allow-all opt-in (20 Nov 2026). Hard denies and the denylist still apply. */
export const MEET_AI_ALL_WORKSPACES_ENV = 'MEET_AI_ALL_WORKSPACES';
export const MEET_AI_ALL_WORKSPACES_REVIEWED = 'reviewed-allow-all-2026-11-20';

/** Easy Center is never a Meet AI workspace. */
export const EASY_CENTER_WORKSPACE_ID = '42529372-c669-4833-bb32-2cab1f4ffd83';

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

/** Null distinguishes a malformed list from an absent or empty list. */
function readAllowlist(env: MeetAiGateEnv) {
  const raw = binding(env, MEET_AI_WORKSPACE_ALLOWLIST_ENV);
  if (raw === undefined) return new Set<string>();
  if (typeof raw !== 'string') {
    warnOnce(`${MEET_AI_WORKSPACE_ALLOWLIST_ENV} is not a string`);
    return null;
  }
  const ids = workspaceIds(raw);
  if (ids.includes('*')) {
    warnOnce(
      `${MEET_AI_WORKSPACE_ALLOWLIST_ENV} contains '*', which is not an allow-all value`
    );
    return null;
  }
  if (ids.some((id) => !UUID.test(id))) {
    warnOnce(`${MEET_AI_WORKSPACE_ALLOWLIST_ENV} contains a non-UUID entry`);
    return null;
  }
  return new Set(ids);
}

/** The explicit workspace list. Malformed configuration admits no ids. */
export function meetAiEnabledWorkspaceIds(env: MeetAiGateEnv) {
  return readAllowlist(env) ?? new Set<string>();
}

export function isMeetAiAllWorkspacesOptIn(env: MeetAiGateEnv) {
  return (
    binding(env, MEET_AI_ALL_WORKSPACES_ENV) === MEET_AI_ALL_WORKSPACES_REVIEWED
  );
}

/**
 * Hard denies apply to Meet and Parley; only pilot lists may be bypassed.
 * Accept only canonical database UUIDs, never normalize a request identity.
 */
export function isMeetAiHardDenied(
  wsId: string | null | undefined,
  env: MeetAiGateEnv
) {
  if (env && Object.hasOwn(env, MEET_AI_KILL_SWITCH_ENV)) return true;
  const disabled = binding(env, MEET_AI_DISABLED_ENV);
  if (disabled !== 'false' && disabled !== '0') return true;
  const id = typeof wsId === 'string' ? wsId : '';
  if (id.length !== 36 || !UUID.test(id)) return true;
  if (id === EASY_CENTER_WORKSPACE_ID) return true;
  const protectedRaw = binding(env, MEET_AI_PROTECTED_WORKSPACES_ENV);
  if (typeof protectedRaw !== 'string') return true;
  const protectedIds = workspaceIds(protectedRaw);
  if (!protectedIds.length || protectedIds.some((entry) => !UUID.test(entry)))
    return true;
  return protectedIds.includes(id);
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

  const allWorkspaces = binding(env, MEET_AI_ALL_WORKSPACES_ENV);
  const optedIn = isMeetAiAllWorkspacesOptIn(env);
  if (allWorkspaces !== undefined && allWorkspaces !== '' && !optedIn) {
    warnOnce(`${MEET_AI_ALL_WORKSPACES_ENV} is not the reviewed opt-in value`);
    return false;
  }

  const allowed = readAllowlist(env);
  return allowed !== null && (optedIn || allowed.has(id));
}
