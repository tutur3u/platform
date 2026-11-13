import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from './index';
const now = '2026-11-10T12:00:00.000Z';
function token(
  n: number,
  cap?: number,
  role: 'host' | 'speaker' = n === 1 ? 'host' : 'speaker'
) {
  return meetRealtimeTokenPayloadSchema.parse({
    userId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    role,
    exp: Date.parse(now) / 1000 + 600,
    meetingId: '11111111-1111-4111-8111-111111111111',
    wsId: '22222222-2222-4222-8222-222222222222',
    roomId: 'test:classroom',
    limits: {
      maxParticipants: cap,
      maxPublishers: cap ?? 8,
      maxViewers: cap ?? 96,
    },
    scopes: getMeetRealtimeScopesForRole(role),
  });
}
function fill(cap: number) {
  let state = createMeetRoomSnapshot();
  for (let n = 1; n <= cap; n++) {
    const result = admitOrHold(state, token(n, cap), now);
    expect(result.reply.some((x) => x.type === 'ready')).toBe(true);
    state = result.state;
  }
  return state;
}
describe('classroom room limits', () => {
  it.each([10, 50, 100])(
    'admits exactly %i signed participants including host and refuses one more',
    (cap) => {
      const state = fill(cap);
      expect(Object.keys(state.presence)).toHaveLength(cap);
      expect(admitOrHold(state, token(cap + 1, cap), now).reply).toContainEqual(
        { type: 'error', error: 'participant_limit_reached' }
      );
    }
  );
  it('rejects a signed cap above platform100 at token boundary', () =>
    expect(() => token(1, 101)).toThrow());
  it('does not let a legacy token bypass a persisted room cap', () => {
    expect(admitOrHold(fill(10), token(11), now).reply).toContainEqual({
      type: 'error',
      error: 'participant_limit_reached',
    });
  });
  it('retains the legacy publisher cap when no classroom policy is signed', () => {
    let state = createMeetRoomSnapshot();
    for (let n = 1; n <= 8; n++)
      state = admitOrHold(state, token(n), now).state;
    expect(admitOrHold(state, token(9), now).reply).toContainEqual({
      type: 'error',
      error: 'publisher_limit_reached',
    });
  });
  it('host can lower the room maximum, never over plan, and participants cannot change it', () => {
    const state = fill(2);
    const host = token(1, 2);
    const other = token(2, 2);
    const run = (
      settings: { maxParticipants?: number; admissionClosed?: boolean },
      actor = host
    ) =>
      applyMeetRoomCommand(state, {
        token: actor,
        now,
        message: { type: 'room.settings.update', settings },
      });
    expect(
      run({ maxParticipants: 3 }).state.settings?.maxParticipants
    ).toBeUndefined();
    expect(
      run({ maxParticipants: 1 }, other).state.settings?.maxParticipants
    ).toBeUndefined();
    expect(run({ maxParticipants: 1 }).state.settings?.maxParticipants).toBe(1);
  });
  it('stop admission refuses direct, remembered and lobby joins without removing current users', () => {
    let state = fill(2);
    state = applyMeetRoomCommand(state, {
      token: token(1, 2),
      now,
      message: {
        type: 'room.settings.update',
        settings: { admissionClosed: true },
      },
    }).state;
    expect(
      admitOrHold(state, token(1, 2), now).reply.some((x) => x.type === 'ready')
    ).toBe(true);
    for (const admission of ['open', 'lobby'] as const)
      expect(
        admitOrHold(state, { ...token(3, 2), admission }, now).reply
      ).toContainEqual({ type: 'error', error: 'admission_closed' });
    expect(Object.keys(state.presence)).toHaveLength(2);
  });
  it('stopped lobby decisions cannot admit a waiting participant', () => {
    let state = admitOrHold(createMeetRoomSnapshot(), token(1, 10), now).state;
    state = admitOrHold(
      state,
      { ...token(2, 10), admission: 'lobby' },
      now
    ).state;
    state = applyMeetRoomCommand(state, {
      token: token(1, 10),
      now,
      message: {
        type: 'room.settings.update',
        settings: { admissionClosed: true },
      },
    }).state;
    const result = applyMeetRoomCommand(state, {
      token: token(1, 10),
      now,
      message: {
        type: 'admission.decide',
        userId: token(2, 10).userId,
        admit: true,
      },
    });
    expect(result.state.presence[token(2, 10).userId]).toBeUndefined();
    expect(result.reply).toContainEqual({
      type: 'error',
      error: 'admission_closed',
    });
  });
});

it('upgrades a full legacy publisher budget before testing the first current join, without renewing time', () => {
  let state = createMeetRoomSnapshot();
  for (let n = 1; n <= 8; n++) state = admitOrHold(state, token(n), now).state;
  const expiresAt = state.budget?.expiresAt;
  const next = admitOrHold(state, token(9, 50), now);
  expect(next.reply.some((x) => x.type === 'ready')).toBe(true);
  expect(next.state.budget?.maxParticipants).toBe(50);
  expect(next.state.budget?.expiresAt).toBe(expiresAt);
});
it('never raises an established plan cap from a higher-limit token', () => {
  const state = fill(10);
  const result = admitOrHold(state, token(11, 100), now);
  expect(result.reply).toContainEqual({
    type: 'error',
    error: 'participant_limit_reached',
  });
  expect(result.state.budget?.maxParticipants).toBe(10);
});
it('a second concurrent-order lobby decision observes the first filled slot', () => {
  let state = admitOrHold(createMeetRoomSnapshot(), token(1, 2), now).state;
  for (const n of [2, 3])
    state = admitOrHold(
      state,
      { ...token(n, 2), admission: 'lobby' },
      now
    ).state;
  state = applyMeetRoomCommand(state, {
    token: token(1, 2),
    now,
    message: {
      type: 'admission.decide',
      userId: token(2, 2).userId,
      admit: true,
    },
  }).state;
  const result = applyMeetRoomCommand(state, {
    token: token(1, 2),
    now,
    message: {
      type: 'admission.decide',
      userId: token(3, 2).userId,
      admit: true,
    },
  });
  expect(Object.keys(result.state.presence)).toHaveLength(2);
  expect(result.reply).toContainEqual({
    type: 'error',
    error: 'participant_limit_reached',
  });
});
