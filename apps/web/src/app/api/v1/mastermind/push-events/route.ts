import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextResponse } from 'next/server';
import {
  completeMastermindPushClaim,
  releaseMastermindPushClaim,
} from '@/lib/mastermind/push-events/claims';
import {
  deliverMastermindPushEvent,
  type MastermindPushAdminClient,
  parseMastermindPushOwnerIds,
  resolveMastermindPushLocale,
} from '@/lib/mastermind/push-events/delivery';
import {
  mastermindPushEventKey,
  mastermindPushEventSchema,
} from '@/lib/mastermind/push-events/schema';
import {
  MASTERMIND_PUSH_SIGNATURE_HEADER,
  MASTERMIND_PUSH_TIMESTAMP_HEADER,
  verifyMastermindPushSignature,
} from '@/lib/mastermind/push-events/signature';

const MAX_BODY_BYTES = 8 * 1024;
/** Covers one synchronous fan-out; a crashed claim frees itself after this. */
const EVENT_PENDING_TTL_SECONDS = 2 * 60;
const EVENT_DONE = 'done';

const NO_STORE = { 'cache-control': 'private, no-store' };

function reject(error: string, status: number) {
  // Never echo input or payload content.
  console.warn('Mastermind push event rejected', { reason: error });
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * Reads at most `MAX_BODY_BYTES` from the stream, whatever Content-Length
 * says, and cancels the stream past the cap. Returns null when it is over.
 */
async function readCappedBody(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * POST /api/v1/mastermind/push-events
 * Receives a signed Mastermind hub event and fans it out to the owners'
 * mobile devices synchronously. It schedules nothing.
 */
export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return reject('payload_too_large', 413);
  let rawBody: string | null;
  try {
    rawBody = await readCappedBody(request);
  } catch {
    return reject('invalid_event', 400);
  }
  if (rawBody === null) return reject('payload_too_large', 413);

  const signature = verifyMastermindPushSignature({
    secret: process.env.MASTERMIND_PUSH_HMAC_SECRET,
    nextSecret: process.env.MASTERMIND_PUSH_HMAC_SECRET_NEXT,
    signature: request.headers.get(MASTERMIND_PUSH_SIGNATURE_HEADER),
    timestamp: request.headers.get(MASTERMIND_PUSH_TIMESTAMP_HEADER),
    rawBody,
  });
  if (signature === 'unconfigured') return reject('unavailable', 503);
  if (signature !== 'ok') return reject('unauthorized', 401);

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return reject('invalid_event', 400);
  }
  const parsed = mastermindPushEventSchema.safeParse(json);
  if (!parsed.success) return reject('invalid_event', 400);
  const event = parsed.data;

  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) return reject('unavailable', 503);

  // Only this token may complete or release this pending claim.
  const claimToken = `pending:${crypto.randomUUID()}`;
  const replayKey = `mastermind:push:event:${mastermindPushEventKey(event)}`;
  try {
    const claimed = await redis.set(replayKey, claimToken, {
      ex: EVENT_PENDING_TTL_SECONDS,
      nx: true,
    });
    if (claimed !== 'OK') {
      if ((await redis.get(replayKey)) === EVENT_DONE)
        return reject('duplicate_event', 409);
      // Still in flight (or just released): the sender retries later.
      return reject('event_in_flight', 503);
    }
  } catch {
    return reject('unavailable', 503);
  }

  const releaseClaim = () =>
    Promise.resolve(
      releaseMastermindPushClaim(redis, replayKey, claimToken)
    ).catch(() => undefined);

  try {
    const admin = await createAdminClient({ noCookie: true });
    const result = await deliverMastermindPushEvent({
      admin: admin as unknown as MastermindPushAdminClient,
      event,
      ownerIds: parseMastermindPushOwnerIds(
        process.env.MASTERMIND_PUSH_OWNER_IDS
      ),
      redis,
      locale: resolveMastermindPushLocale(process.env.MASTERMIND_PUSH_LOCALE),
    });

    if (result.failed > 0) {
      // Successful owners retain per-event receipts across coalescing windows.
      await releaseClaim();
      console.warn('Mastermind push event partially failed', {
        type: event.type,
        ...result,
      });
      return reject('delivery_failed', 502);
    }

    await Promise.resolve(
      completeMastermindPushClaim(redis, replayKey, claimToken)
    ).catch(() =>
      console.warn('Failed to mark Mastermind push event as delivered')
    );
    console.info('Mastermind push event delivered', {
      type: event.type,
      ...result,
    });
    return NextResponse.json(
      { accepted: true, ...result },
      { status: 202, headers: NO_STORE }
    );
  } catch {
    await releaseClaim();
    return reject('delivery_failed', 502);
  }
}
