const buckets = new Map<string, { resetAt: number; count: number }>();

export const MEET_ACTOR_LIMIT_WINDOW_MS = 60_000;
export const MEET_ATTENDANCE_READ_LIMIT = 30;
export const MEET_TIMER_COMMAND_LIMIT = 20;

export function takeActorRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
) {
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    pruneActorRateLimits(now);
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function pruneActorRateLimits(now: number) {
  if (buckets.size <= 5000) return;
  for (const [key, bucket] of buckets)
    if (now >= bucket.resetAt) buckets.delete(key);
  if (buckets.size > 5000) buckets.clear();
}

export function allowMeetActorAction(
  kind: 'attendance' | 'timer',
  actorId: string,
  roomId: string,
  now = Date.now()
) {
  const limit =
    kind === 'attendance'
      ? MEET_ATTENDANCE_READ_LIMIT
      : MEET_TIMER_COMMAND_LIMIT;
  return takeActorRateLimit(
    `${kind}:${actorId}:${roomId}`,
    limit,
    MEET_ACTOR_LIMIT_WINDOW_MS,
    now
  );
}
