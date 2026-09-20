import { randomUUID } from 'node:crypto';
import { coordinate, coordinationKey } from '@tuturuuu/utils/coordination';

export class MeetingCreateError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const ACCEPT_WINDOW_MS = 15 * 60_000;

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
  send: typeof coordinate = coordinate
): Promise<T> {
  assertRecentMeetingRequest(args.requestId);
  const lease = {
    namespace: 'meeting' as const,
    key: coordinationKey(args.id),
    owner: randomUUID(),
  };
  const acquired = await send({
    ...lease,
    action: 'acquire',
    fingerprint: args.hash,
  }).catch(() => {
    throw new MeetingCreateError(
      503,
      'Meeting delivery is temporarily unavailable'
    );
  });
  if (acquired.outcome === 'conflict')
    throw new MeetingCreateError(
      409,
      'This meeting request was already used with different details'
    );
  if (acquired.outcome === 'busy')
    throw new MeetingCreateError(
      409,
      'This meeting request is already being processed'
    );
  if (acquired.outcome !== 'acquired')
    throw new MeetingCreateError(503, 'Meeting delivery status is unavailable');
  try {
    const result = await run({
      fresh: acquired.fresh,
      completed: acquired.completed,
    });
    // Provider idempotency and the encrypted DB reservation remain authoritative.
    // A failed cleanup/status write must not turn a successful send into a new send.
    try {
      const completion = await send({ ...lease, action: 'complete' });
      if (completion.outcome !== 'completed')
        console.warn('Meeting completion lease expired');
    } catch {
      console.warn('Could not record meeting completion');
    }
    return result;
  } finally {
    try {
      await send({ ...lease, action: 'release' });
    } catch {
      /* The bounded lease expires automatically. */
    }
  }
}
