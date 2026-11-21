import { NextResponse } from 'next/server';
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
  const alerts = await readFleetAlerts();
  if (!alerts) return fleetError('unavailable', 503);
  return NextResponse.json({ alerts }, { headers: FLEET_NO_STORE });
}
