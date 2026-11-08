import { z } from 'zod';
import type { Owner } from './auth';

const accessResponse = z.object({ enabled: z.boolean() });

export async function hasLiveRootAccess(owner: Owner): Promise<boolean> {
  try {
    const response = await fetch('https://tuturuuu.com/api/v1/mastermind/access', {
      headers: { Authorization: `Bearer ${owner.token}` },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status !== 200) return false;
    const result = accessResponse.safeParse(await response.json());
    return result.success && result.data.enabled;
  } catch {
    return false;
  }
}
