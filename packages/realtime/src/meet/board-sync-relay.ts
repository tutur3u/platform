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
  private blocked: { id: string; kind: GuestRelayKind } | null = null;

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
   * Relays due updates until one needs more bytes. That update gets first
   * claim on the refill. Returns the delay until the next flush could relay
   * something, or null when nothing is held.
   */
  flush(now: number, target: GuestRelayTarget): number | null {
    const {
      relayBytesCapacity: capacity,
      relayBytesPerSecond: refill,
      relayIntervalMs: interval,
    } = BOARD_GUEST_LIMITS;
    let tokens = refillBucket(this.bucket, now, capacity, refill);
    const tokensAt = Math.max(now, this.bucket.tokensAt ?? now);
    let wait: number | null = null;
    const priority = this.blocked;
    this.blocked = null;
    // Prune disconnected senders even beyond the first unaffordable update.
    const pending = [...this.pending].flatMap(([id, entry]) => {
      const fanout = target.fanout(id);
      if (fanout === null || fanout === 0) {
        this.pending.delete(id);
        return [];
      }
      return [{ id, entry, fanout }];
    });
    const blockedIndex = pending.findIndex(({ id }) => id === priority?.id);
    if (blockedIndex > 0) pending.unshift(...pending.splice(blockedIndex, 1));
    for (const { id, entry, fanout } of pending) {
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
        if (priority?.id === id) {
          this.blocked = priority;
          break;
        }
        continue;
      }
      let sent = false;
      const first = priority?.id === id ? priority.kind : 'cursor';
      for (const kind of [
        first,
        first === 'cursor' ? 'selection' : 'cursor',
      ] as const) {
        const payload = entry[kind];
        if (!payload) continue;
        const cost = bytesOf(payload) * fanout;
        // A relay the full bucket could never cover is dropped.
        if (cost > capacity) {
          delete entry[kind];
          continue;
        }
        if (cost > tokens) {
          this.blocked = { id, kind };
          const refillWait = Math.ceil(((cost - tokens) / refill) * 1000);
          // Keep a clock rollback from arming a timer longer than a full refill
          // plus the relay interval, without crediting that time to the bucket.
          wait = Math.min(
            (capacity / refill) * 1000 + interval,
            Math.max(tokensAt - now + refillWait, sent ? interval : 0)
          );
          break;
        }
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
      if (this.blocked) break;
    }
    this.bucket = { tokens, tokensAt };
    return wait;
  }
}
