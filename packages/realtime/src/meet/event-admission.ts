export const MEET_EVENT_DURATION_MS = 6 * 60 * 60_000;
export const MEET_EVENT_GUEST_LIMIT = 80;

export function activeMeetEvent(
  expiresAt: number | undefined,
  now = Date.now()
): number | undefined {
  return expiresAt && expiresAt > now ? expiresAt : undefined;
}
