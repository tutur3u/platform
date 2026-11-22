import { expect, it } from 'vitest';
import { serializedMeetBytes } from './live-activity-rate';
import { MEET_MAX_MESSAGE_BYTES } from './message-size';
import { meetRealtimeClientMessageSchema } from './messages';
import {
  applyPenboard,
  PENBOARD_LIMITS,
  type PenboardStroke,
} from './penboard';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  type MeetRoomSnapshot,
} from './room';
import { endMeetRoom } from './room-ending';

const now = '2026-11-22T08:00:00Z';
const host = meetRealtimeTokenPayloadSchema.parse({
  roomId: 'penboard',
  wsId: crypto.randomUUID(),
  meetingId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  role: 'host',
  exp: 2_000_000_000,
});
const guest = {
  ...host,
  role: 'speaker' as const,
  userId: crypto.randomUUID(),
};
const room = () => ({
  ...createMeetRoomSnapshot(),
  presence: Object.fromEntries(
    [host, guest].map((token) => [token.userId, createMeetPresence(token, now)])
  ),
});
const point = {
  x: 123.4,
  y: 321.1,
  pressure: 0.777,
  tiltX: 19,
  tiltY: -11,
  t: 999,
};
const stroke = (
  points: PenboardStroke['points'] = [point]
): PenboardStroke => ({
  id: crypto.randomUUID(),
  authorId: host.userId,
  input: 'pen',
  color: 'blue',
  width: 6,
  startedAt: 1,
  points,
});
const draw = (ink: PenboardStroke = stroke()) => ({
  type: 'penboard.draw',
  stroke: ink,
  requestId: ink.id,
});
const run = (state: MeetRoomSnapshot, token: typeof host, input: unknown) => {
  const result = applyPenboard(state, {
    message: meetRealtimeClientMessageSchema.parse(input),
    token,
    now,
  });
  if (!result) throw new Error('Expected a penboard outcome');
  return result;
};
const fail = (error: string) => [{ type: 'error', error }];

it('uses server attribution and broadcasts one stroke; redelivery remains idempotent after undo', () => {
  const ink = stroke();
  const initial = room();
  expect(run(initial, guest, { type: 'penboard.read' }).reply).toEqual([
    {
      type: 'penboard.snapshot',
      revision: 0,
      strokes: [],
      requestId: undefined,
    },
  ]);
  expect(run(createMeetRoomSnapshot(), guest, draw(ink)).reply).toMatchObject(
    fail('awaiting_admission')
  );

  const first = run(initial, guest, draw(ink));
  const canonical = first.state.penboard?.strokes[0];
  expect(canonical).toMatchObject({
    authorId: guest.userId,
    startedAt: Date.parse(now),
    points: [point],
  });
  expect(canonical?.id).not.toBe(ink.id);
  expect(first.broadcast).toEqual([
    { type: 'penboard.stroke', revision: 1, stroke: canonical },
  ]);
  const second = run(first.state, host, draw());
  const duplicate = run(second.state, guest, draw(ink));
  expect(duplicate.state).toBe(second.state);
  expect(duplicate.broadcast).toEqual([]);
  expect(duplicate.reply).toEqual([
    {
      type: 'penboard.stroke',
      revision: 1,
      stroke: canonical,
      requestId: ink.id,
    },
  ]);
  const undo = run(second.state, guest, { type: 'penboard.undo' });
  expect(undo.broadcast).toMatchObject([
    {
      type: 'penboard.snapshot',
      revision: 3,
      strokes: [{ authorId: host.userId }],
    },
  ]);
  expect(run(undo.state, guest, draw(ink)).reply).toMatchObject(
    fail('penboard_stroke_removed')
  );
  expect(
    run(undo.state, guest, { type: 'penboard.clear' }).reply
  ).toMatchObject(fail('permission_denied'));
  expect(
    run(undo.state, host, { type: 'penboard.undo' }).state.penboard?.strokes
  ).toEqual([]);
  const cleared = run(undo.state, host, { type: 'penboard.clear' });
  expect(cleared.broadcast).toMatchObject([
    { type: 'penboard.snapshot', revision: 4, strokes: [] },
  ]);
  expect(run(cleared.state, guest, draw(ink)).reply).toMatchObject(
    fail('penboard_stroke_removed')
  );
  expect(endMeetRoom(cleared.state, now).penboard).toBeUndefined();
});

it('rejects oversized point lists, author quotas, and aggregate board bytes', () => {
  expect(
    meetRealtimeClientMessageSchema.safeParse(
      draw(
        stroke(
          Array.from(
            { length: PENBOARD_LIMITS.pointsPerStroke + 1 },
            () => point
          )
        )
      )
    ).success
  ).toBe(false);
  let state = room();
  for (let index = 0; index < PENBOARD_LIMITS.strokesPerAuthor; index++)
    state = run(state, guest, draw()).state;
  expect(run(state, guest, draw()).reply).toMatchObject(fail('penboard_full'));
  const long = () =>
    draw(
      stroke(
        Array.from({ length: PENBOARD_LIMITS.pointsPerStroke }, () => point)
      )
    );
  const accepted = run(room(), guest, long());
  expect(accepted.broadcast).toHaveLength(1);
  const second = run(accepted.state, host, long());
  expect(second.state).toBe(accepted.state);
  expect(second.reply).toMatchObject(fail('penboard_full'));
  const read = run(accepted.state, guest, {
    type: 'penboard.read',
    requestId: 'x'.repeat(120),
  });
  expect(serializedMeetBytes(read.reply[0])).toBeLessThan(
    MEET_MAX_MESSAGE_BYTES
  );
});

it('keeps drawing after the receipt ledger fills, forgetting strokes no longer on the board', () => {
  const kept = run(room(), guest, draw());
  const visible = kept.state.penboard!;
  const stale = Object.fromEntries(
    Array.from({ length: PENBOARD_LIMITS.drawReceipts - 1 }, (_, index) => [
      `${guest.userId}:${crypto.randomUUID()}`,
      { id: crypto.randomUUID(), revision: index + 1 },
    ])
  );
  const full: MeetRoomSnapshot = {
    ...kept.state,
    penboard: { ...visible, drawIds: { ...visible.drawIds, ...stale } },
  };
  expect(Object.keys(full.penboard!.drawIds)).toHaveLength(
    PENBOARD_LIMITS.drawReceipts
  );
  const next = run(full, host, draw());
  expect(next.broadcast).toMatchObject([{ type: 'penboard.stroke' }]);
  const receipts = Object.values(next.state.penboard!.drawIds);
  // The visible strokes keep their receipts, so a redelivery stays idempotent.
  expect(receipts.map(({ id }) => id).sort()).toEqual(
    next.state.penboard!.strokes.map(({ id }) => id).sort()
  );
});
