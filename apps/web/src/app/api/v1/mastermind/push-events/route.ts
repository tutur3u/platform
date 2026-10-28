import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { NextResponse } from 'next/server';
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
const EVENT_REPLAY_TTL_SECONDS = 24 * 60 * 60;

const NO_STORE = { 'cache-control': 'private, no-store' };

function reject(error: string, status: number) {
  // Never echo input or payload content.
  console.warn('Mastermind push event rejected', { reason: error });
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * POST /api/v1/mastermind/push-events
 * Receives a signed Mastermind hub event and fans it out to the owners'
 * mobile devices synchronously. It schedules nothing.
 */
export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return reject('payload_too_large', 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES)
    return reject('payload_too_large', 413);

  const signature = verifyMastermindPushSignature({
    secret: process.env.MASTERMIND_PUSH_HMAC_SECRET,
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

  const replayKey = `mastermind:push:event:${mastermindPushEventKey(event)}`;
  let claimed: unknown;
  try {
    claimed = await redis.set(replayKey, '1', {
      ex: EVENT_REPLAY_TTL_SECONDS,
      nx: true,
    });
  } catch {
    return reject('unavailable', 503);
  }
  if (claimed !== 'OK') return reject('duplicate_event', 409);

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

    if (result.failed > 0 && result.sent === 0) {
      // Nothing reached anyone: let the sender retry the same event.
      await Promise.resolve(redis.del(replayKey)).catch(() => undefined);
      return reject('delivery_failed', 502);
    }

    console.info('Mastermind push event delivered', {
      type: event.type,
      ...result,
    });
    return NextResponse.json(
      { accepted: true, ...result },
      { status: 202, headers: NO_STORE }
    );
  } catch {
    await Promise.resolve(redis.del(replayKey)).catch(() => undefined);
    return reject('delivery_failed', 502);
  }
}
