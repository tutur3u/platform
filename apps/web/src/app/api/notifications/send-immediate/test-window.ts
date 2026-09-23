const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function createRecentNotificationWindow() {
  const createdAt = new Date(Date.now() - HOUR_MS);
  const windowEnd = new Date(createdAt.getTime() + 5 * MINUTE_MS);

  return {
    created_at: createdAt.toISOString(),
    window_end: windowEnd.toISOString(),
  };
}

export function getStaleCreatedAt(): string {
  return new Date(Date.now() - (DAY_MS + HOUR_MS)).toISOString();
}
