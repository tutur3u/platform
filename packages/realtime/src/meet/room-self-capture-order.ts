import type { SelfOutboxEntry } from './room-self-capture-state';

/**
 * Session ends in outbox order that may go out with `picked`: an `end` entry
 * is released only when every earlier entry of its session is in `picked`
 * (or already acknowledged), so the Meet Worker stops a session only after
 * its participant entries. Callers pick their non-end entries first and offer
 * ends only the capacity left, so a held end never takes a slot. `admit`
 * decides whether a releasable end fits.
 */
export function releasableEnds(
  outbox: readonly SelfOutboxEntry[],
  picked: ReadonlySet<SelfOutboxEntry>,
  admit: (entry: SelfOutboxEntry) => boolean
): SelfOutboxEntry[] {
  const held = new Set<string>();
  const ends: SelfOutboxEntry[] = [];
  for (const entry of outbox) {
    if (entry.kind !== 'end') {
      if (!picked.has(entry)) held.add(entry.sessionId);
    } else if (!held.has(entry.sessionId) && admit(entry)) ends.push(entry);
  }
  return ends;
}
