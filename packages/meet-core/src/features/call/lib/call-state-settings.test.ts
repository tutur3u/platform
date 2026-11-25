import { expect, it } from 'vitest';
import { INITIAL_CALL_STATE, reduceCallState } from './call-state';

const settings = { shareNotes: false };
const ROOM_NOW = '2026-11-25T08:00:00.000Z';

it('keeps the settings features and the clock skew measured on arrival', () => {
  // This device is ten minutes ahead of the room when the settings arrive.
  const receivedAt = Date.parse(ROOM_NOW) + 600_000;
  const state = reduceCallState(
    INITIAL_CALL_STATE,
    {
      type: 'room.settings',
      settings,
      features: ['joinQr'],
      serverNow: ROOM_NOW,
    },
    receivedAt
  );
  expect(state.settingsFeatures).toEqual(['joinQr']);
  expect(state.settingsClockSkew).toBe(-600_000);
  // A later message without a clock keeps the last measurement.
  const next = reduceCallState(
    state,
    { type: 'room.settings', settings, features: ['joinQr'] },
    receivedAt + 60_000
  );
  expect(next.settingsClockSkew).toBe(-600_000);
});

it('measures the timer clock skew when the timer arrives', () => {
  const state = reduceCallState(
    INITIAL_CALL_STATE,
    { type: 'classTimer', timer: null, serverNow: ROOM_NOW },
    Date.parse(ROOM_NOW) - 30_000
  );
  expect(state.classTimerClockSkew).toBe(30_000);
});

it('announces no features for a room on an older realtime Worker', () => {
  const state = reduceCallState(
    { ...INITIAL_CALL_STATE, settingsFeatures: ['joinQr'] },
    { type: 'room.settings', settings }
  );
  expect(state.settingsFeatures).toEqual([]);
});
