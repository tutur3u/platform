import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bridgeFailure, fleetBridge } from '@/lib/mastermind/fleet/bridge';
import {
  authorizeFleetPublisher,
  FLEET_NO_STORE,
  fleetError,
} from '@/lib/mastermind/fleet/http';

const ticketRequestSchema = z
  .object({ machineId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u) })
  .strict();

/**
 * Orchestrator machine: a single-use, 60-second ticket for its bridge socket.
 * The request is signed like every publisher call (method, path and body
 * bound, signature accepted once), so the store Worker never sees a machine
 * credential and the machine never holds the store's service token.
 */
export async function POST(request: Request) {
  const auth = await authorizeFleetPublisher(request, 1024);
  if (!auth.ok) return auth.response;
  let json: unknown;
  try {
    json = JSON.parse(auth.body);
  } catch {
    return fleetError('invalid_json', 400);
  }
  const parsed = ticketRequestSchema.safeParse(json);
  if (!parsed.success) return fleetError('invalid_ticket_request', 422);
  const bridge = fleetBridge();
  if (!bridge) return fleetError('unavailable', 503);
  try {
    const { ticket, expiresAt } = await bridge.ticket({
      role: 'machine',
      machineId: parsed.data.machineId,
    });
    return NextResponse.json(
      {
        url: bridge.socketUrl,
        ticket,
        expiresAt: new Date(expiresAt).toISOString(),
      },
      { headers: FLEET_NO_STORE }
    );
  } catch (error) {
    return bridgeFailure(error);
  }
}
