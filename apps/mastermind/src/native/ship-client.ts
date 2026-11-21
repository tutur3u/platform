import { z } from 'zod';
import {
  type ShipCheckResult,
  type ShipSnapshot,
  shipCheckResultSchema,
  shipSnapshotSchema,
} from '../../../web/src/lib/mastermind/ship/contract';
import type { Owner } from './auth';

const WEB_SHIP = 'https://tuturuuu.com/api/v1/mastermind/fleet/ship';

const shipResponseSchema = z.object({
  snapshot: shipSnapshotSchema,
  servedAt: z.iso.datetime({ offset: true }),
});

export type ShipRead =
  | { kind: 'ready'; snapshot: ShipSnapshot; servedAt: string }
  | { kind: 'uncollected' }
  | { kind: 'error'; reason: 'denied' | 'unavailable' | 'invalid' };

export type ShipCheck = ShipCheckResult | { state: 'denied' | 'unavailable' };

/** workerd refuses `redirect: 'error'`; a redirect response is refused here. */
function refused(response: Response) {
  return (
    String(response.type) === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400)
  );
}

/**
 * Web ship API calls with the owner's satellite bearer. Every body is
 * validated against Web's ship contract before it reaches a render.
 */
export function createShipClient(owner: Owner, fetcher: typeof fetch = fetch) {
  const headers = { Authorization: `Bearer ${owner.token}` };
  return {
    async read(fresh = false): Promise<ShipRead> {
      try {
        const response = await fetcher(
          new Request(fresh ? `${WEB_SHIP}?fresh=1` : WEB_SHIP, {
            headers,
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(8_000),
          })
        );
        if (refused(response)) return { kind: 'error', reason: 'unavailable' };
        if (response.status === 404) return { kind: 'uncollected' };
        if (response.status === 401 || response.status === 403)
          return { kind: 'error', reason: 'denied' };
        if (!response.ok) return { kind: 'error', reason: 'unavailable' };
        const parsed = shipResponseSchema.safeParse(await response.json());
        return parsed.success
          ? { kind: 'ready', ...parsed.data }
          : { kind: 'error', reason: 'invalid' };
      } catch {
        return { kind: 'error', reason: 'unavailable' };
      }
    },
    async check(): Promise<ShipCheck> {
      try {
        const response = await fetcher(
          new Request(`${WEB_SHIP}/check`, {
            method: 'POST',
            headers,
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(50_000),
          })
        );
        if (refused(response)) return { state: 'unavailable' };
        if (response.status === 401 || response.status === 403)
          return { state: 'denied' };
        const parsed = shipCheckResultSchema.safeParse(await response.json());
        return parsed.success ? parsed.data : { state: 'unavailable' };
      } catch {
        return { state: 'unavailable' };
      }
    },
  };
}
