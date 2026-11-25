import { expect, it } from 'vitest';
import { INITIAL_CALL_STATE, reduceCallState } from './call-state';

const settings = { shareNotes: false };

it('keeps the settings features and clock a current room announces', () => {
  const state = reduceCallState(INITIAL_CALL_STATE, {
    type: 'room.settings',
    settings,
    features: ['joinQr'],
    serverNow: '2026-11-25T08:00:00.000Z',
  });
  expect(state.settingsFeatures).toEqual(['joinQr']);
  expect(state.settingsServerNow).toBe('2026-11-25T08:00:00.000Z');
  // A later reply without a clock keeps the last reading.
  const next = reduceCallState(state, {
    type: 'room.settings',
    settings,
    features: ['joinQr'],
  });
  expect(next.settingsServerNow).toBe('2026-11-25T08:00:00.000Z');
});

it('announces no features for a room on an older realtime Worker', () => {
  const state = reduceCallState(
    { ...INITIAL_CALL_STATE, settingsFeatures: ['joinQr'] },
    { type: 'room.settings', settings }
  );
  expect(state.settingsFeatures).toEqual([]);
});
