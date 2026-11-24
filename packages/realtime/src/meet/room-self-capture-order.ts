import type { SelfOutboxEntry } from './room-self-capture-state';

/**
 * Keeps the outbox order across accounts for session ends: an `end` entry is
 * released only together with, or after, every earlier entry of its session,
 * so the Meet Worker stops a session only after its participant entries.
 * `chosen` is a subset of `outbox`; the result keeps its order.
 */
export function releasableEntries(
  outbox: readonly SelfOutboxEntry[],
  chosen: readonly SelfOutboxEntry[]
): SelfOutboxEntry[] {
  const picked = new Set(chosen);
  const blocked = new Set<SelfOutboxEntry>();
  const held = new Set<string>();
  for (const entry of outbox) {
    if (!picked.has(entry)) held.add(entry.sessionId);
    else if (entry.kind === 'end' && held.has(entry.sessionId))
      blocked.add(entry);
  }
  return blocked.size
    ? chosen.filter((entry) => !blocked.has(entry))
    : [...chosen];
}
