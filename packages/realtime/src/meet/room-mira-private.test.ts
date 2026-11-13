import { expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { roomService, type RoomServiceState } from './room-service';
import { MIRA_PRIVATE_NOTICE_VERSION as version } from './room-mira-private';
const account = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000004';
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId: '00000000-0000-4000-8000-000000000002',
  mode: 'call',
  role: 'speaker',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: account,
  accountId: account,
  wsId: '00000000-0000-4000-8000-000000000003',
});
const initial = (): RoomServiceState =>
  admitOrHold(createMeetRoomSnapshot(), token, '2026-11-13T00:00:00Z').state;
it('records only the admitted actor choice and refuses registration before the click', () => {
  const state = initial();
  expect(
    roomService(state, token, { action: 'mira.private.register', sessionId })
      .status
  ).toBe(403);
  const result = roomService(state, token, {
    action: 'mira.private.choice',
    choice: 'continue',
    version,
    accountId: 'foreign',
  });
  expect(result.state.miraPrivate?.choices[account]).toMatchObject({
    accountId: account,
    meetingId: token.meetingId,
    choice: 'continue',
    version,
    revision: 1,
  });
  expect(result.state.miraPrivate?.choices.foreign).toBeUndefined();
  expect(
    result.state.miraPrivate?.choices[account]?.recordedAt
  ).toBeGreaterThan(0);
  expect(
    roomService(
      state,
      { ...token, scopes: [] },
      { action: 'mira.private.choice', choice: 'continue', version }
    ).status
  ).toBe(403);
  expect(
    roomService(
      state,
      { ...token, accountId: 'foreign' },
      { action: 'mira.private.read' }
    ).status
  ).toBe(403);
});
it('requires stopping active sessions before mute and broadcasts private usage to the room', () => {
  let state = roomService(initial(), token, {
    action: 'mira.private.choice',
    choice: 'continue',
    version,
  }).state;
  const started = roomService(state, token, {
    action: 'mira.private.register',
    sessionId,
  });
  state = started.state;
  expect(state.presence[account]?.miraPrivate).toBe(true);
  expect(started.messages?.some((message) => message.type === 'presence')).toBe(
    true
  );
  expect(
    roomService(state, token, {
      action: 'mira.private.choice',
      choice: 'mute',
      version,
    }).status
  ).toBe(409);
  state = roomService(state, token, {
    action: 'mira.private.ended',
    sessionId,
  }).state;
  expect(state.presence[account]?.miraPrivate).toBe(false);
  state = roomService(state, token, {
    action: 'mira.private.choice',
    choice: 'mute',
    version,
  }).state;
  expect(state.miraPrivate?.choices[account]?.revision).toBe(2);
  expect(
    roomService(state, token, { action: 'mira.private.register', sessionId })
      .status
  ).toBe(403);
  state = roomService(state, token, {
    action: 'mira.private.choice',
    choice: 'continue',
    version,
  }).state;
  expect(state.miraPrivate?.choices[account]?.revision).toBe(3);
  expect(
    roomService(state, token, { action: 'mira.private.register', sessionId })
      .status
  ).toBeUndefined();
});
it('does not admit a stale legal version, ended meeting, or newly joined actor by default', () => {
  const state = initial();
  expect(
    roomService(state, token, {
      action: 'mira.private.choice',
      choice: 'continue',
      version: 'old',
    }).status
  ).toBe(400);
  expect(
    roomService({ ...state, ended: true }, token, {
      action: 'mira.private.choice',
      choice: 'continue',
      version,
    }).status
  ).toBe(403);
  expect(
    roomService(state, token, { action: 'mira.private.read' }).body
  ).toMatchObject({ choice: null, sessions: [] });
});
