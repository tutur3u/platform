import { z } from 'zod';
import { meetAiWorkerEnv } from './workspace-gate';

export const MEET_AI_PER_SPEAKER_ENV = 'MEET_AI_PER_SPEAKER';
export const MEET_AI_PER_SPEAKER_WORKSPACES_ENV =
  'MEET_AI_PER_SPEAKER_WORKSPACES';

type FlagEnv = Record<string, unknown> | null | undefined;

const read = (env: FlagEnv, key: string) =>
  env ? Reflect.get(env, key) : undefined;

/**
 * Allowlisted workspace ids. An empty, missing or unparseable value admits
 * nothing: one malformed entry voids the whole list.
 */
export function meetPerSpeakerWorkspaceIds(env: FlagEnv): Set<string> {
  const raw = read(env, MEET_AI_PER_SPEAKER_WORKSPACES_ENV);
  if (typeof raw !== 'string' || !raw.trim()) return new Set();
  const ids = raw.split(',').map((value) => value.trim().toLowerCase());
  if (ids.some((id) => !z.uuid().safeParse(id).success)) return new Set();
  return new Set(ids);
}

/**
 * Per-speaker capture is on for a workspace only when the kill switch is
 * explicitly off, `MEET_AI_PER_SPEAKER` equals `true` and the workspace is
 * allowlisted. Anything else is off.
 */
export function isMeetPerSpeakerEnabled(
  wsId: string | null | undefined,
  env: FlagEnv
) {
  if (!wsId) return false;
  const disabled = read(env, 'MEET_AI_DISABLED');
  if (disabled !== 'false' && disabled !== '0') return false;
  if (read(env, MEET_AI_PER_SPEAKER_ENV) !== 'true') return false;
  return meetPerSpeakerWorkspaceIds(env).has(wsId.toLowerCase());
}

/** Re-reads the Worker env on every call; no Cloudflare context is off. */
export async function meetPerSpeakerEnabled(wsId: string | null | undefined) {
  const env = await meetAiWorkerEnv();
  return isMeetPerSpeakerEnabled(wsId, env as FlagEnv);
}
