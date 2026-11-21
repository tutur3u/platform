import { z } from 'zod';
import type { Owner } from './auth';

const accessResponse = z.object({ enabled: z.boolean() });
const fleetAccessResponse = z.object({
  enabled: z.boolean(),
  stopped: z.boolean(),
});

export async function hasLiveRootAccess(owner: Owner): Promise<boolean> {
  try {
    const response = await fetch(
      'https://tuturuuu.com/api/v1/mastermind/access',
      {
        headers: { Authorization: `Bearer ${owner.token}` },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (response.type === 'opaqueredirect' || !response.ok) return false;
    const result = accessResponse.safeParse(await response.json());
    return result.success && result.data.enabled;
  } catch {
    return false;
  }
}

/**
 * A live, unstopped Fleet grant for the session's user. The Fleet API looks
 * the grant up on every call; any failure denies.
 */
export async function hasLiveFleetGrant(
  token: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  try {
    const response = await fetcher('https://tuturuuu.com/api/v1/fleet/access', {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.type === 'opaqueredirect' || !response.ok) return false;
    const result = fleetAccessResponse.safeParse(await response.json());
    return result.success && result.data.enabled && !result.data.stopped;
  } catch {
    return false;
  }
}
