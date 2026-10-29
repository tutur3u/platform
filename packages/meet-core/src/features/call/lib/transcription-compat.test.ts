import { expect, it } from 'vitest';
import { INITIAL_CALL_STATE, reduceCallState } from './call-state';

const sessionId = '44444444-4444-4444-8444-444444444444';
const host = '33333333-3333-4333-8333-333333333333';
const guest = '55555555-5555-4555-8555-555555555555';
const active = {
  active: true as const,
  sessionId,
  startedBy: host,
  language: 'vi' as const,
  consentRequired: true as const,
};

it('tracks transcription state and consent for the current session only', () => {
  const started = reduceCallState(INITIAL_CALL_STATE, {
    type: 'transcription.state',
    state: active,
  });
  expect(started.transcription.state).toEqual(active);
  const consented = reduceCallState(started, {
    type: 'transcription.consent',
    userId: guest,
    allowed: true,
  });
  expect(consented.transcription.consents).toEqual({ [guest]: true });
  const replayed = reduceCallState(consented, {
    type: 'transcription.state',
    state: active,
  });
  expect(replayed.transcription.consents).toEqual({ [guest]: true });
  const next = reduceCallState(consented, {
    type: 'transcription.state',
    state: { ...active, sessionId: '66666666-6666-4666-8666-666666666666' },
  });
  expect(next.transcription.consents).toEqual({});
  const stopped = reduceCallState(consented, {
    type: 'transcription.state',
    state: { ...active, active: false },
  });
  expect(stopped.transcription.consents).toEqual({});
});

it('ignores consent while transcription is inactive and clears on room end', () => {
  expect(
    reduceCallState(INITIAL_CALL_STATE, {
      type: 'transcription.consent',
      userId: guest,
      allowed: true,
    }).transcription.consents
  ).toEqual({});
  const started = reduceCallState(INITIAL_CALL_STATE, {
    type: 'transcription.state',
    state: active,
  });
  expect(
    reduceCallState(started, { type: 'room.ended' }).transcription.state
  ).toBeUndefined();
});
