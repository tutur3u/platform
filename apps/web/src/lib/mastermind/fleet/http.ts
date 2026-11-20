import 'server-only';

import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextResponse } from 'next/server';
import { claimFleetNonce, type FleetRedis } from './store';
import { verifyFleetPublisher, FLEET_SIGNATURE_HEADER } from './auth';

export const FLEET_NO_STORE = { 'cache-control': 'private, no-store' };

export function fleetError(error: string, status: number) {
  // Closed-set reason only; request content is never echoed or logged.
  if (status >= 500) console.warn('Mastermind fleet request failed', { error });
  return NextResponse.json({ error }, { status, headers: FLEET_NO_STORE });
}

export async function fleetRedis(): Promise<FleetRedis | null> {
  try {
    return await getUpstashRestRedisClient();
  } catch {
    return null;
  }
}

/** Reads at most `maxBytes`, cancelling the stream past the cap. */
export async function readCappedText(request: Request, maxBytes: number) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks)
    );
  } catch {
    return null;
  }
}

/**
 * Verifies a publisher request and claims its signature once. Returns the
 * raw body and a Redis client, or the response to send.
 */
export async function authorizeFleetPublisher(
  request: Request,
  maxBytes: number
): Promise<
  | { ok: true; body: string; redis: FleetRedis }
  | { ok: false; response: Response }
> {
  const body = await readCappedText(request, maxBytes);
  if (body === null)
    return { ok: false, response: fleetError('payload_too_large', 413) };
  const verdict = verifyFleetPublisher(request, body);
  if (verdict === 'unconfigured')
    return { ok: false, response: fleetError('unconfigured', 503) };
  if (verdict !== 'ok')
    return { ok: false, response: fleetError('unauthorized', 401) };
  const redis = await fleetRedis();
  if (!redis) return { ok: false, response: fleetError('unavailable', 503) };
  const signature = request.headers.get(FLEET_SIGNATURE_HEADER)?.trim() ?? '';
  try {
    if (!(await claimFleetNonce(redis, signature)))
      return { ok: false, response: fleetError('replayed', 409) };
  } catch {
    return { ok: false, response: fleetError('unavailable', 503) };
  }
  return { ok: true, body, redis };
}
