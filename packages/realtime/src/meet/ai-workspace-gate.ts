/** Runtime-injected, server-only Meet AI controls. Credit admission is separate. */
export const MEET_AI_WORKSPACE_ALLOWLIST_ENV = 'MEET_AI_ENABLED_WORKSPACE_IDS';
export const MEET_AI_DISABLED_ENV = 'MEET_AI_DISABLED';
export const MEET_AI_WORKSPACE_DENYLIST_ENV = 'MEET_AI_DISABLED_WORKSPACE_IDS';

export type MeetAiGateEnv = object | null | undefined;

function binding(env: MeetAiGateEnv, name: string): unknown {
  return env && name in env ? Reflect.get(env, name) : undefined;
}

function workspaceIds(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((id) => id.toLowerCase())
    .filter(Boolean);
}

/** Optional legacy rollout restriction; blank and unset impose no restriction. */
export function meetAiEnabledWorkspaceIds(env: MeetAiGateEnv) {
  const raw = binding(env, MEET_AI_WORKSPACE_ALLOWLIST_ENV);
  return new Set(typeof raw === 'string' ? workspaceIds(raw) : []);
}

export function isMeetAiEnabledForWorkspace(
  wsId: string | null | undefined,
  env: MeetAiGateEnv
) {
  if (!wsId?.trim()) return false;
  const disabled = binding(env, MEET_AI_DISABLED_ENV);
  if (
    disabled !== undefined &&
    (typeof disabled !== 'string' ||
      !['0', 'false'].includes(disabled.trim().toLowerCase()))
  )
    return false;

  const denied = binding(env, MEET_AI_WORKSPACE_DENYLIST_ENV);
  if (denied !== undefined) {
    if (typeof denied !== 'string') return false;
    const ids = workspaceIds(denied);
    if (
      ids.some(
        (id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
      )
    )
      return false;
    if (ids.includes(wsId.toLowerCase())) return false;
  }

  const legacy = binding(env, MEET_AI_WORKSPACE_ALLOWLIST_ENV);
  if (legacy !== undefined && typeof legacy !== 'string') return false;
  const enabled = meetAiEnabledWorkspaceIds(env);
  return enabled.size === 0 || enabled.has(wsId.toLowerCase());
}
