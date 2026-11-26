import { expect, it } from 'vitest';
import { startRoomBudget } from './room-budget';
import { admitOrHold } from './room-admission';
import {
  arena,
  host,
  ok,
  player,
  run,
  setup,
  uuid,
} from './room-quiz-arena.fixtures';

const guest = {
  ...player(1),
  guest: true as const,
  roomId: 'arena-guest-check',
};
const config = { answerMode: 'buzz_in', playMode: 'individual' } as const;

it('requires live admission, the stable guest id and a room without a removal ban', () => {
  const state = setup(config);
  const read = { action: 'arena.state' };
  for (const snapshot of [
    { ...state, presence: {} },
    { ...state, ended: true },
    { ...state, removedGuests: { [guest.accountId]: Date.now() + 60_000 } },
  ])
    expect(run(snapshot, guest, read).status).toBe(403);
  expect(run(state, { ...guest, accountId: undefined }, read).status).toBe(403);
  expect(
    run(
      state,
      { ...host, guest: true, accountId: guest.accountId },
      { action: 'arena.endGame' }
    ).status
  ).toBe(403);
});

it('announces the board to joiners after admission and on host changes', () => {
  const state = setup(config);
  state.budget = startRoomBudget(state, host, Date.now()).budget;
  const now = new Date().toISOString();
  const announce = { type: 'quizArena.changed', active: true };
  expect(admitOrHold(state, guest, now).reply).toContainEqual(announce);
  expect(
    admitOrHold(state, { ...player(20), guest: true }, now).reply
  ).not.toContainEqual(announce);
  expect(
    run(state, host, {
      action: 'arena.pickTile',
      tileId: arena(state).tiles[0]!.id,
    }).messages
  ).toContainEqual(announce);
  expect(run(state, host, { action: 'arena.endGame' }).messages).toContainEqual(
    { ...announce, active: false }
  );
});

it('uses the admitted name for a late player and enforces wager and buzz rules', () => {
  let state = setup(config);
  const tileId = arena(state).tiles[1]!.id;
  delete arena(state).players[guest.accountId];
  state = ok(state, host, { action: 'arena.pickTile', tileId });
  const wager = { action: 'arena.wager', tileId, amount: 10 };
  expect(run(state, guest, { ...wager, amount: 100_000 }).status).toBe(400);
  state = ok(state, { ...guest, displayName: 'Changed cookie name' }, wager);
  expect(arena(state).players[guest.accountId]?.displayName).toBe('Player 1');
  expect(run(state, guest, wager).status).toBe(409);
  state = ok(state, guest, { action: 'arena.buzz', tileId });
  expect(arena(state).tiles[1]?.buzzQueue[0]?.userId).toBe(guest.accountId);
});

it('charges refused attempts against the guest mutation budget, isolated by room', () => {
  const state = setup(config);
  const token = { ...guest, roomId: 'arena-guest-budget' };
  const cmd = { action: 'arena.buzz', tileId: uuid(800) };
  for (let count = 0; count < 30; count++)
    expect(run(state, token, cmd).status).not.toBe(429);
  expect(run(state, token, cmd).status).toBe(429);
  expect(run(state, { ...token, roomId: 'another-room' }, cmd).status).not.toBe(
    429
  );
});

it('limits guest reads separately from mutations', () => {
  const state = setup(config);
  const token = { ...guest, roomId: 'arena-read-budget' };
  for (let i = 0; i < 60; i++)
    expect(run(state, token, { action: 'arena.state' }).status).toBeUndefined();
  expect(run(state, token, { action: 'arena.state' }).status).toBe(429);
});

it('announces the first buzz and skips queue appends', () => {
  let state = setup(config);
  const tileId = arena(state).tiles[0]!.id;
  state = ok(state, host, { action: 'arena.pickTile', tileId });
  const cmd = { action: 'arena.buzz', tileId };
  const first = run(state, guest, cmd);
  expect(first.messages).toHaveLength(1);
  expect(run(first.state, player(2), cmd).messages).toBeUndefined();
});
