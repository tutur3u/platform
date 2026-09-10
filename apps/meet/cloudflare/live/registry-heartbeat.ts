import type { LiveSessionClaims } from '../../src/features/live-assistant/contracts';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

/** Keep long sessions discoverable by privacy changes, including after the initial 24 hours. */
export async function refreshLiveRegistry(
  env: LiveEnvironment,
  claims: LiveSessionClaims
) {
  const response = await env.MEET_LIVE.get(
    env.MEET_LIVE.idFromName(`owner:${claims.ownerId}`)
  ).fetch('https://live.internal/registry/register', {
    method: 'POST',
    body: JSON.stringify(claims),
  });
  if (!response.ok) throw new Error('Live privacy registry unavailable');
}

/** Retry transient registry outages while the last durable entry is still valid. */
export async function maintainLiveRegistry(
  env: LiveEnvironment,
  saved: SavedSession
) {
  const last = saved.registryUpdatedAt ?? saved.startedAt;
  if (Date.now() - last < 12 * 60 * 60_000) return;
  try {
    await refreshLiveRegistry(env, saved.claims);
    saved.registryUpdatedAt = Date.now();
  } catch (error) {
    // Stop before the 24-hour registry lease expires: memory revocations must
    // always be able to find every session that can still use private context.
    if (Date.now() - last >= 23 * 60 * 60_000) throw error;
  }
}
