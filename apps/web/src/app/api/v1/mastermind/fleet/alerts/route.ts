import { NextResponse } from 'next/server';
import { mobileIssueBatchSchema } from '@/lib/mastermind/fleet/mobile-issues-contract';
import { relayMobileIssueControl } from '@/lib/mastermind/fleet/mobile-issues-control';
import {
  InvalidMobileIssueSlot,
  readMobileIssues,
  recordMobileIssues,
} from '@/lib/mastermind/fleet/mobile-issues-store';
import { readFleetAlerts } from '@/lib/mastermind/fleet/alerts';
import {
  authorizeFleetPublisher,
  FLEET_NO_STORE,
  fleetError,
} from '@/lib/mastermind/fleet/http';

/**
 * Orchestrator pull: firing SLO burn alerts in the owner-read shape, so the
 * publisher Mac needs only its HMAC secret, never an infrastructure token.
 */
export async function GET(request: Request) {
  const auth = await authorizeFleetPublisher(request, 0);
  if (!auth.ok) return auth.response;
  const [alerts, mobileIssues] = await Promise.all([
    readFleetAlerts(),
    process.env.MASTERMIND_MOBILE_ALERTS_SECRET
      ? readMobileIssues(auth.store)
      : Promise.resolve(null),
  ]);
  if (!alerts) return fleetError('unavailable', 503);
  return NextResponse.json(
    { alerts, ...(mobileIssues?.length ? { mobileIssues } : {}) },
    { headers: FLEET_NO_STORE }
  );
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/v1/mastermind/fleet/alerts' || url.search)
    return fleetError('invalid_target', 400);
  const auth = await authorizeFleetPublisher(request, 8_192);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = JSON.parse(auth.body);
  } catch {
    return fleetError('invalid_json', 400);
  }
  const parsed = mobileIssueBatchSchema.safeParse(body);
  if (!parsed.success) return fleetError('invalid_mobile_alerts', 422);
  try {
    const inserted = await recordMobileIssues(auth.store, parsed.data);
    return NextResponse.json(
      { accepted: true, inserted },
      { headers: FLEET_NO_STORE }
    );
  } catch (error) {
    return error instanceof InvalidMobileIssueSlot
      ? fleetError('invalid_slot', 422)
      : fleetError('mobile_alerts_unavailable', 503);
  }
}

export async function POST(request: Request) {
  return relayMobileIssueControl(request);
}
