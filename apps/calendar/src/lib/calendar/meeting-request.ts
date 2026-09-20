import { randomUUID } from 'node:crypto';
import {
  getUpstashRatelimitRedisClient,
  type UpstashRatelimitRedisClient,
} from '@tuturuuu/utils/upstash-rest';

export class MeetingCreateError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const ACCEPT_WINDOW_MS = 15 * 60_000;
const RECORD_SECONDS = 2 * 60 * 60;
const LEASE_SECONDS = 10 * 60;
const RELEASE =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
type RecordState = { hash: string; completed: boolean };

export function assertRecentMeetingRequest(
  requestId: string,
  now = Date.now()
) {
  if (
    !/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      requestId
    )
  ) {
    throw new MeetingCreateError(
      400,
      'A new meeting request identifier is required'
    );
  }
  const createdAt = Number.parseInt(
    requestId.replaceAll('-', '').slice(0, 12),
    16
  );
  if (createdAt > now + 60_000 || now - createdAt > ACCEPT_WINDOW_MS) {
    throw new MeetingCreateError(
      409,
      'This meeting request expired. Check your calendar before trying again'
    );
  }
}

/** A retry cannot recreate a deleted event. Only a hash and outcome are stored,
 * and the record outlives the timestamp-bound request acceptance window. */
export async function withMeetingRequest<T>(
  args: { id: string; hash: string; requestId: string },
  run: (state: { fresh: boolean; completed: boolean }) => Promise<T>,
  loadRedis: () => Promise<UpstashRatelimitRedisClient | null> = getUpstashRatelimitRedisClient
): Promise<T> {
  assertRecentMeetingRequest(args.requestId);
  const redis = await loadRedis();
  if (!redis)
    throw new MeetingCreateError(
      503,
      'Meeting delivery is temporarily unavailable'
    );
  const key = `calendar:meeting-request:v1:${args.id}`;
  const leaseKey = `${key}:lease`;
  const owner = randomUUID();
  const acquired = await redis.set(leaseKey, owner, {
    nx: true,
    ex: LEASE_SECONDS,
  });
  if (!acquired)
    throw new MeetingCreateError(
      409,
      'This meeting request is already being processed'
    );
  try {
    const initial: RecordState = { hash: args.hash, completed: false };
    const fresh = Boolean(
      await redis.set(key, initial, { nx: true, ex: RECORD_SECONDS })
    );
    const record = await redis.get<RecordState>(key);
    if (
      !record ||
      typeof record.hash !== 'string' ||
      typeof record.completed !== 'boolean'
    ) {
      throw new MeetingCreateError(
        503,
        'Meeting delivery status is unavailable'
      );
    }
    if (record.hash !== args.hash) {
      throw new MeetingCreateError(
        409,
        'This meeting request was already used with different details'
      );
    }
    const result = await run({ fresh, completed: record.completed });
    // A lease must still be ours before recording completion. Never overwrite a
    // newer attempt after a stalled provider request has exceeded its lease.
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3]); return 1 else return 0 end",
      [leaseKey, key],
      [
        owner,
        JSON.stringify({ hash: args.hash, completed: true }),
        RECORD_SECONDS,
      ]
    );
    return result;
  } finally {
    // Cleanup failure must not turn a completed invitation into a retryable send.
    try {
      await redis.eval(RELEASE, [leaseKey], [owner]);
    } catch {
      /* lease expires */
    }
  }
}
