import type { MeetRealtimeServerMessage } from './messages';
import type { MeetRealtimePresence } from './primitives';

type Presence = Record<string, MeetRealtimePresence>;
type Delta = Extract<MeetRealtimeServerMessage, { type: 'presence.delta' }>;

export function computePresenceDiff(before: Presence, after: Presence) {
  return {
    upserted: Object.values(after).filter((person) => {
      const prior = before[person.userId];
      return (
        prior !== person && JSON.stringify(prior) !== JSON.stringify(person)
      );
    }),
    removed: Object.keys(before).filter((id) => !Object.hasOwn(after, id)),
  };
}

/** Use the last state in a burst so intermediate toggles never reach the wire. */
export function coalescePresenceUpdates(
  before: Presence,
  after: Presence,
  roomId: string,
  seq: number
): Delta {
  return {
    type: 'presence.delta',
    roomId,
    seq,
    ...computePresenceDiff(before, after),
  };
}

/** A gap leaves the current view intact until a full snapshot arrives. */
export function applyPresenceDelta(
  before: Presence,
  seq: number | null,
  delta: Delta
) {
  if (seq !== null && delta.seq <= seq)
    return { presence: before, seq, gap: false };
  if (seq === null || delta.seq !== seq + 1)
    return { presence: before, seq, gap: true };
  const presence = { ...before };
  for (const id of delta.removed) delete presence[id];
  for (const person of delta.upserted) presence[person.userId] = person;
  return { presence, seq: delta.seq, gap: false };
}

type PresenceSnapshot = { presence: Presence; presenceSeq?: number };

/** A room-wide sequence advances with committed batches and survives hibernation. */
export class MeetPresencePublisher {
  private published: Presence = {};
  private durable: Presence = {};
  private seq = 0;
  private pending = false;
  private write = 0;
  private committed = 0;

  restore(snapshot: PresenceSnapshot) {
    this.seq = snapshot.presenceSeq ?? 0;
    this.published = this.durable = snapshot.presence;
  }

  full(
    roomId: string
  ): Extract<MeetRealtimeServerMessage, { type: 'presence' }> {
    return {
      type: 'presence',
      roomId,
      seq: this.seq,
      presence: Object.values(this.published),
    };
  }

  async persist(
    snapshot: PresenceSnapshot,
    write: () => Promise<void>,
    emit: (create: (roomId: string) => Delta) => void,
    keepAlive: (task: Promise<void>) => void
  ) {
    const { presence } = snapshot;
    const version = ++this.write;
    if (presence !== this.durable) snapshot.presenceSeq = this.seq + 1;
    await write();
    if (version < this.committed || presence === this.durable) return;
    this.committed = version;
    this.durable = presence;
    if (this.pending) return;
    this.pending = true;
    keepAlive(
      new Promise<void>((resolve) =>
        setTimeout(() => {
          this.pending = false;
          const prior = this.published;
          const seq = ++this.seq;
          const next = (this.published = this.durable);
          try {
            emit((roomId) => coalescePresenceUpdates(prior, next, roomId, seq));
          } finally {
            resolve();
          }
        }, 50)
      )
    );
  }
}
