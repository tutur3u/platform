import { type ChurnBucket, refillBucket } from './board-sync-guest';
import { BOARD_GUEST_LIMITS } from './board-sync-schema';

export type GuestRelayKind = 'cursor' | 'selection';

type Pending = {
  cursor?: string;
  selection?: string;
  /** When this connection's cursor or selection was last relayed. */
  sentAt?: number;
};

export interface GuestRelayTarget {
  /** Sockets that receive a connection's relay, or null once it has gone. */
  fanout: (connectionId: string) => number | null;
  /** Sends a relay payload to everyone on the board except its sender. */
  send: (connectionId: string, payload: string) => void;
}

const bytesOf = (payload: string) => new TextEncoder().encode(payload).length;

/**
 * Coalesces and budgets the cursor and selection relays of people outside
 * the workspace. Each connection holds at most its latest cursor and latest
 * selection, relayed at most every `relayIntervalMs`; an update that arrives
 * sooner replaces the held one. Every relay spends the board's shared byte
 * bucket by its payload size times the sockets it reaches, and a relay the
 * bucket cannot cover stays held, still only the latest, until it refills.
 * Members relay directly and never touch it.
 *
 * Both live in memory, so they cost no storage write. An eviction restarts
 * the bucket full and drops held updates, which grants at most one extra
 * burst: a hibernating room is evicted only after about ten seconds idle,
 * and the bucket refills from empty in two.
 */
export class GuestRelay {
  private pending = new Map<string, Pending>();
  private bucket: ChurnBucket = {};

  /** Holds `payload` as the connection's latest update of its kind. */
  hold(connectionId: string, kind: GuestRelayKind, payload: string) {
    const entry = this.pending.get(connectionId) ?? {};
    entry[kind] = payload;
    this.pending.set(connectionId, entry);
  }

  /** Connections with a held update or a recent relay; for bounds checks. */
  get size() {
    return this.pending.size;
  }

  /**
   * Relays every held update that is due and within the bucket. Returns the
   * milliseconds until the next flush could relay something, or null when
   * nothing is held.
   */
  flush(now: number, target: GuestRelayTarget): number | null {
    const {
      relayBytesCapacity: capacity,
      relayBytesPerSecond: refill,
      relayIntervalMs: interval,
    } = BOARD_GUEST_LIMITS;
    let tokens = refillBucket(this.bucket, now, capacity, refill);
    let wait: number | null = null;
    // Iterating a copy: a relayed connection moves to the back, so the
    // bucket is shared out in turn rather than to the first guest.
    for (const [id, entry] of [...this.pending]) {
      const fanout = target.fanout(id);
      if (fanout === null || fanout === 0) {
        this.pending.delete(id);
        continue;
      }
      const held = !!(entry.cursor || entry.selection);
      const since =
        entry.sentAt === undefined
          ? Number.POSITIVE_INFINITY
          : now - entry.sentAt;
      // A clock that went back counts as due, so nothing waits on it.
      const early = since >= 0 && since < interval;
      if (!held) {
        // Nothing held: forget the connection once its gap has passed.
        if (!early) this.pending.delete(id);
        continue;
      }
      if (early) {
        wait = Math.min(wait ?? interval, interval - since);
        continue;
      }
      let sent = false;
      for (const kind of ['cursor', 'selection'] as const) {
        const payload = entry[kind];
        if (!payload) continue;
        const cost = bytesOf(payload) * fanout;
        // A relay the full bucket could never cover is dropped.
        if (cost > capacity) {
          delete entry[kind];
          continue;
        }
        if (cost > tokens) continue;
        tokens -= cost;
        target.send(id, payload);
        delete entry[kind];
        sent = true;
      }
      if (sent) {
        entry.sentAt = now;
        this.pending.delete(id);
        this.pending.set(id, entry);
      }
      // Still held: over the bucket, so try again a gap later.
      if (entry.cursor || entry.selection)
        wait = Math.min(wait ?? interval, interval);
    }
    this.bucket = { tokens, tokensAt: now };
    return wait;
  }
}
