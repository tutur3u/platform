import type { BoardChange, BoardElement } from './board-sync-schema';

/**
 * Excalidraw 0.18 element fields the board keeps from people outside the
 * workspace: the shared base, text, linear and arrow, freedraw and frame
 * fields. Anything else (`customData` included) is dropped before it can
 * reach the stored scene.
 */
const GUEST_ELEMENT_KEYS = new Set([
  'id',
  'type',
  'x',
  'y',
  'width',
  'height',
  'angle',
  'strokeColor',
  'backgroundColor',
  'fillStyle',
  'strokeWidth',
  'strokeStyle',
  'roundness',
  'roughness',
  'opacity',
  'seed',
  'version',
  'versionNonce',
  'index',
  'isDeleted',
  'groupIds',
  'frameId',
  'boundElements',
  'updated',
  'link',
  'locked',
  'text',
  'originalText',
  'fontSize',
  'fontFamily',
  'textAlign',
  'verticalAlign',
  'containerId',
  'autoResize',
  'lineHeight',
  'baseline',
  'points',
  'lastCommittedPoint',
  'startBinding',
  'endBinding',
  'startArrowhead',
  'endArrowhead',
  'elbowed',
  'fixedSegments',
  'startIsSpecial',
  'endIsSpecial',
  'polygon',
  'pressures',
  'simulatePressure',
  'name',
]);

/** An http(s) URL or a same-site path, query or fragment; nothing else. */
export function isSafeBoardLink(link: unknown) {
  if (typeof link !== 'string') return false;
  const value = link.trim();
  if (/^[/?#]/.test(value)) return !value.startsWith('//');
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** A guest's element with only known fields and a safe link or none. */
export function sanitizeGuestElement(element: BoardElement): BoardElement {
  const kept = Object.fromEntries(
    Object.entries(element).filter(([key]) => GUEST_ELEMENT_KEYS.has(key))
  ) as BoardElement;
  if ('link' in kept && kept.link !== null && !isSafeBoardLink(kept.link))
    kept.link = null;
  return kept;
}

export const sanitizeGuestChanges = (changes: readonly BoardChange[]) =>
  changes.map((change) => ({
    ...change,
    element: sanitizeGuestElement(change.element),
  }));

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
