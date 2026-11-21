import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_APP_SESSION,
} from '@/lib/mastermind/fleet/auth';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';
import { requestShipCheck } from '@/lib/mastermind/ship/check';

/**
 * Owner "Check now": runs the ship collector immediately. Cron Control
 * refuses a second run within 30 seconds (429 with `retryAfterMs`).
 */
export const POST = withSessionAuth(
  async (_request, { user }) => {
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);
    const { status, ...result } = await requestShipCheck({
      MASTERMIND_SHIP_CHECK_ORIGIN: process.env.MASTERMIND_SHIP_CHECK_ORIGIN,
      MASTERMIND_SHIP_CHECK_TOKEN: process.env.MASTERMIND_SHIP_CHECK_TOKEN,
      WEB_CRON_GATE_ORIGIN: process.env.WEB_CRON_GATE_ORIGIN,
    });
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
  }
);
