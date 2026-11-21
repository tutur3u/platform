import { z } from 'zod';
import type { Owner } from './auth';

const accessResponse = z.object({ enabled: z.boolean() });
/**
 * Only a live grant row admits a grantee. The Fleet API answers the
 * configured Owner with tier `owner` and no grant row, so that tier never
 * admits the grantee path.
 */
const fleetGrantResponse = z.object({
  enabled: z.literal(true),
  tier: z.enum(['observer', 'steerer', 'operator']),
  stopped: z.literal(false),
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
 * A live, unstopped, non-Owner Fleet grant for the session's user. The Fleet
 * API looks the grant up on every call; any failure denies.
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
    return fleetGrantResponse.safeParse(await response.json()).success;
  } catch {
    return false;
  }
}
