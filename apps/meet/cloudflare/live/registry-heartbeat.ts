import type { LiveSessionClaims } from '../../src/features/live-assistant/contracts';
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
