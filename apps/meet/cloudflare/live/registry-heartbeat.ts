import type { LiveSessionClaims } from '../../src/features/live-assistant/contracts';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

export class LiveRegistryError extends Error {
  constructor(readonly status: number) {
    super('Live privacy registry unavailable');
  }
}

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
  if (!response.ok) throw new LiveRegistryError(response.status);
}

/** Retry transient registry outages while the last durable entry is still valid. */
export async function maintainLiveRegistry(
  env: LiveEnvironment,
  saved: SavedSession
) {
  if (saved.ended) return removeLiveRegistry(env, saved.claims);
  const last = saved.registryUpdatedAt ?? saved.startedAt;
  if (Date.now() - last < 12 * 60 * 60_000) return;
  try {
    await refreshLiveRegistry(env, saved.claims);
    saved.registryUpdatedAt = Date.now();
  } catch (error) {
    // Stop before the 24-hour registry lease expires: memory revocations must
    // always be able to find every session that can still use private context.
    if (
      (error instanceof LiveRegistryError &&
        error.status < 500 &&
        ![408, 429].includes(error.status)) ||
      Date.now() - last >= 23 * 60 * 60_000
    )
      throw error;
  }
  if (saved.ended) {
    saved.registryRemoved = false;
    await removeLiveRegistry(env, saved.claims);
    saved.registryRemoved = true;
  }
}

export async function removeLiveRegistry(
  env: LiveEnvironment,
  claims: LiveSessionClaims
) {
  const response = await env.MEET_LIVE.get(
    env.MEET_LIVE.idFromName(`owner:${claims.ownerId}`)
  ).fetch('https://live.internal/registry/remove', {
    method: 'POST',
    body: JSON.stringify(claims),
  });
  if (!response.ok) throw new LiveRegistryError(response.status);
}
