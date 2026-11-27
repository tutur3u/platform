import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRoomFrame, type RoomState } from './room-client.ts';

const now = 1_800_000_000_000;
const me = { id: 'me', x: 1, z: 2 };
const peer = { id: 'peer', x: 3, z: 4 };
const joining: RoomState = { status: 'joining' };
const ready = {
  type: 'ready',
  self: me,
  peers: [peer],
  leaseUntil: now / 1000 + 10,
};
const frame = (value: unknown) => JSON.stringify(value);

test('applies the room snapshot, authoritative position and nearby departure', () => {
  const state = applyRoomFrame(joining, frame(ready), now);
  assert.deepEqual(state, {
    status: 'joined',
    self: me,
    peers: [peer],
    leaseUntil: ready.leaseUntil,
  });
  assert.strictEqual(
    applyRoomFrame(state, frame({ type: 'position', self: peer }), now),
    state
  );
  const moved = { ...me, x: 2 };
  const movedState = applyRoomFrame(
    state,
    frame({ type: 'position', self: moved }),
    now
  );
  assert.deepEqual(movedState, { ...state, self: moved });
  assert.deepEqual(
    applyRoomFrame(movedState, frame({ type: 'leave', id: peer.id }), now),
    {
      ...movedState,
      peers: [],
    }
  );
});

test('never renews a lease on socket frames and drops room state at its deadline', () => {
  const state = applyRoomFrame(joining, frame(ready), now);
  assert.strictEqual(
    applyRoomFrame(
      state,
      frame({ ...ready, leaseUntil: ready.leaseUntil + 100 }),
      now
    ),
    state
  );
  for (const input of [joining, state]) {
    assert.deepEqual(
      applyRoomFrame(input, frame(ready), ready.leaseUntil * 1000),
      { status: 'expired' }
    );
  }
  assert.strictEqual(
    applyRoomFrame(
      joining,
      frame({ ...ready, peers: Array(32).fill(peer) }),
      now
    ),
    joining
  );
});
