import { isMeetAiHardDenied, type MeetAiGateEnv } from './ai-workspace-gate';

/**
 * Per-speaker transcription flag. The room reads its own copy of both
 * bindings and refuses the per-speaker mode and every per-speaker command
 * when they do not admit the room's workspace. The Meet AI kill switch and
 * hard denies take precedence.
 */
export const MEET_AI_PER_SPEAKER_ENV = 'MEET_AI_PER_SPEAKER';
export const MEET_AI_PER_SPEAKER_WORKSPACES_ENV =
  'MEET_AI_PER_SPEAKER_WORKSPACES';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function binding(env: MeetAiGateEnv, name: string): unknown {
  return env && Object.hasOwn(env, name) ? Reflect.get(env, name) : undefined;
}

/** On only for the exact string `true`. */
export function isMeetAiPerSpeakerOn(env: MeetAiGateEnv) {
  return binding(env, MEET_AI_PER_SPEAKER_ENV) === 'true';
}

/** Allowlisted workspace ids. Empty, absent or any malformed entry admits none. */
export function meetAiPerSpeakerWorkspaceIds(env: MeetAiGateEnv) {
  const raw = binding(env, MEET_AI_PER_SPEAKER_WORKSPACES_ENV);
  if (typeof raw !== 'string') return new Set<string>();
  const ids = raw
    .split(/[\s,]+/)
    .map((id) => id.toLowerCase())
    .filter(Boolean);
  return ids.every((id) => UUID.test(id)) ? new Set(ids) : new Set<string>();
}

export function isMeetAiPerSpeakerEnabled(
  env: MeetAiGateEnv,
  wsId: string | null | undefined
) {
  return (
    isMeetAiPerSpeakerOn(env) &&
    typeof wsId === 'string' &&
    meetAiPerSpeakerWorkspaceIds(env).has(wsId) &&
    !isMeetAiHardDenied(wsId, env)
  );
}
