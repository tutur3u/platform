import { describe, expect, it } from 'vitest';
import { GuestRelay } from './board-sync-relay';
import { BOARD_GUEST_LIMITS } from './board-sync-schema';

const {
  relayBytesCapacity: capacity,
  relayBytesPerSecond: refill,
  relayIntervalMs: interval,
} = BOARD_GUEST_LIMITS;

function target(fanout: Record<string, number | null>) {
  const sent: [string, string][] = [];
  return {
    sent,
    fanout: (id: string) => fanout[id] ?? null,
    send: (id: string, payload: string) => sent.push([id, payload]),
  };
}
/** A payload of exactly `bytes` ASCII bytes. */
const bytes = (count: number) => 'x'.repeat(count);

describe('GuestRelay', () => {
  it('relays the first update at once and coalesces the rest', () => {
    const relay = new GuestRelay();
    const to = target({ a: 3 });
    relay.hold('a', 'cursor', 'c1');
    expect(relay.flush(0, to)).toBeNull();
    relay.hold('a', 'cursor', 'c2');
    relay.hold('a', 'cursor', 'c3');
    relay.hold('a', 'selection', 's1');
    expect(relay.flush(40, to)).toBe(interval - 40);
    expect(relay.flush(interval, to)).toBeNull();
    expect(to.sent).toEqual([
      ['a', 'c1'],
      ['a', 'c3'],
      ['a', 's1'],
    ]);
  });

  it('charges payload bytes times fanout against the shared bucket', () => {
    const relay = new GuestRelay();
    const fanout = 48;
    const size = Math.floor(capacity / fanout / 2) - 1;
    const to = target({ a: fanout, b: fanout, c: fanout });
    for (const id of ['a', 'b', 'c']) relay.hold(id, 'cursor', bytes(size));
    // Two fit the full bucket; the third is held, not dropped or queued.
    expect(relay.flush(0, to)).toBe(interval);
    expect(to.sent.map(([id]) => id)).toEqual(['a', 'b']);
    relay.hold('c', 'cursor', bytes(size));
    const refilled = Math.ceil(((size * fanout) / refill) * 1000);
    relay.flush(refilled, to);
    expect(to.sent.map(([id]) => id)).toEqual(['a', 'b', 'c']);
  });

  it('drops what the full bucket could never cover and gone senders', () => {
    const relay = new GuestRelay();
    const to = target({ a: 2, b: null });
    relay.hold('a', 'selection', bytes(Math.floor(capacity / 2) + 1));
    relay.hold('b', 'cursor', 'c');
    expect(relay.flush(0, to)).toBeNull();
    expect(to.sent).toEqual([]);
    relay.flush(interval, to);
    expect(relay.size).toBe(0);
  });

  it('treats a clock that went back as due', () => {
    const relay = new GuestRelay();
    const to = target({ a: 1 });
    relay.hold('a', 'cursor', 'c1');
    relay.flush(10_000, to);
    relay.hold('a', 'cursor', 'c2');
    expect(relay.flush(0, to)).toBeNull();
    expect(to.sent.map(([, p]) => p)).toEqual(['c1', 'c2']);
  });
});
