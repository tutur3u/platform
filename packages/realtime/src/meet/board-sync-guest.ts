import { guestElementSchema } from './board-sync-guest-element';
import type { BoardChange, BoardElement } from './board-sync-schema';

/** A backslash, an ASCII control character or DEL. */
const hasUnsafeCharacter = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return character === '\\' || code < 0x20 || code === 0x7f;
  });

/**
 * An http(s) URL or a same-site path, query or fragment; nothing else. A
 * backslash or control character anywhere refuses the link, since browsers
 * read a path such as `/\host` or one with a tab after the slash as another
 * site.
 */
export function isSafeBoardLink(link: unknown) {
  if (typeof link !== 'string' || hasUnsafeCharacter(link)) return false;
  const value = link.trim();
  if (/^[/?#]/.test(value)) return !value.startsWith('//');
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A guest's element with only known, well-typed fields and a safe link or
 * none; null when a known field has the wrong type or size.
 */
export function sanitizeGuestElement(
  element: BoardElement
): BoardElement | null {
  const parsed = guestElementSchema.safeParse(element);
  if (!parsed.success) return null;
  const kept = parsed.data as BoardElement;
  if (typeof kept.link === 'string' && !isSafeBoardLink(kept.link))
    kept.link = null;
  return kept;
}

/** A guest's batch with each element sanitized; refused elements are counted. */
export function sanitizeGuestChanges(changes: readonly BoardChange[]) {
  const kept: BoardChange[] = [];
  for (const change of changes) {
    const element = sanitizeGuestElement(change.element);
    if (element) kept.push({ ...change, element });
  }
  return { changes: kept, dropped: changes.length - kept.length };
}

/** Socket opens per person in the current window; memory stays bounded. */
export type BoardOpenWindows = Map<string, { count: number; windowAt: number }>;

const OPEN_WINDOW_MS = 60_000;
const MAX_TRACKED_OPENERS = 1000;

/**
 * Charges one socket open for `userId` and says whether it is within `limit`
 * opens a minute. Windows older than a minute are dropped, and the map never
 * tracks more than a thousand people: the oldest windows go first.
 */
export function chargeBoardOpen(
  windows: BoardOpenWindows,
  userId: string,
  limit: number,
  now: number
) {
  for (const [key, window] of windows)
    if (now - window.windowAt >= OPEN_WINDOW_MS) windows.delete(key);
  const current = windows.get(userId) ?? { count: 0, windowAt: now };
  if (current.count >= limit) return false;
  windows.delete(userId);
  while (windows.size >= MAX_TRACKED_OPENERS) {
    const oldest = windows.keys().next().value;
    if (oldest === undefined) break;
    windows.delete(oldest);
  }
  windows.set(userId, { count: current.count + 1, windowAt: current.windowAt });
  return true;
}
