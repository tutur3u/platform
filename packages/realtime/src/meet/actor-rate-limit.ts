const buckets = new Map<string, { resetAt: number; count: number }>();

export const MEET_ACTOR_LIMIT_WINDOW_MS = 60_000;
export const MEET_ATTENDANCE_READ_LIMIT = 30;
export const MEET_TIMER_COMMAND_LIMIT = 20;

export function takeActorRateLimitWindow(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    pruneActorRateLimits(now);
    return { ok: true };
  }
  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { ok: true };
}

export function takeActorRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
) {
  return takeActorRateLimitWindow(key, limit, windowMs, now).ok;
}

function pruneActorRateLimits(now: number) {
  if (buckets.size <= 5000) return;
  for (const [key, bucket] of buckets)
    if (now >= bucket.resetAt) buckets.delete(key);
  if (buckets.size > 5000) buckets.clear();
}

export type ActorLimitBuckets = Record<
  string,
  { resetAt: number; count: number }
>;

/** Room-scoped buckets. Every isolate that reaches the room shares this state. */
export function takeSnapshotActorLimit(
  buckets: ActorLimitBuckets | undefined,
  kind: 'attendance' | 'timer',
  actorId: string,
  now = Date.now()
) {
  const limit =
    kind === 'attendance'
      ? MEET_ATTENDANCE_READ_LIMIT
      : MEET_TIMER_COMMAND_LIMIT;
  const next: ActorLimitBuckets = {};
  for (const [name, bucket] of Object.entries(buckets ?? {})) {
    if (now < bucket.resetAt) next[name] = bucket;
  }
  const key = `${kind}:${actorId}`;
  const current = next[key];
  if (!current) {
    next[key] = { resetAt: now + MEET_ACTOR_LIMIT_WINDOW_MS, count: 1 };
    return { ok: true, buckets: next };
  }
  if (current.count >= limit) return { ok: false, buckets: next };
  next[key] = { resetAt: current.resetAt, count: current.count + 1 };
  return { ok: true, buckets: next };
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
