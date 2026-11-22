import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_APP_SESSION,
} from '@/lib/mastermind/fleet/auth';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';
import {
  requestShipCheck,
  type ShipCheckBinding,
} from '@/lib/mastermind/ship/check';

declare global {
  interface CloudflareEnv {
    /** Service binding to tuturuuu-cron-control (api-core family only). */
    CRON_CONTROL?: ShipCheckBinding;
  }
}

/** Web's CRON_CONTROL service binding, or null outside a Worker. */
function cronControl(): ShipCheckBinding | null {
  try {
    return getCloudflareContext().env.CRON_CONTROL ?? null;
  } catch {
    return null;
  }
}

export const POST = withSessionAuth(
  async (_request, { user }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const { status, ...result } = await requestShipCheck(
      {
        MASTERMIND_SHIP_CHECK_ORIGIN: process.env.MASTERMIND_SHIP_CHECK_ORIGIN,
        MASTERMIND_SHIP_CHECK_TOKEN: process.env.MASTERMIND_SHIP_CHECK_TOKEN,
        WEB_CRON_GATE_ORIGIN: process.env.WEB_CRON_GATE_ORIGIN,
      },
      cronControl()
    );
    if (status >= 500)
      console.warn('Mastermind ship check failed', { state: result.state });
    // `code` and `retryAfter` (seconds) are the shared API error fields the
    // mobile client reads from a non-2xx answer.
    return NextResponse.json(
      {
        ...result,
        code: result.state,
        ...(result.retryAfterMs
          ? { retryAfter: Math.ceil(result.retryAfterMs / 1000) }
          : {}),
      },
      {
        status,
        headers: {
          ...FLEET_NO_STORE,
          ...(result.retryAfterMs
            ? { 'retry-after': String(Math.ceil(result.retryAfterMs / 1000)) }
            : {}),
        },
      }
    );
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 6 },
    allowAppSessionAuth: MASTERMIND_APP_SESSION,
    // The Mastermind Worker and the phone cannot solve the browser Turnstile
    // step-up; the owner check above is this route's gate, as for the other
    // owner fleet mutations. Server reputation challenges still apply.
    stepUpExempt: (user) => isFleetOwner(user),
  }
);
