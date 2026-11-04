import { expect, it } from 'vitest';
import { INITIAL_CALL_STATE, reduceCallState } from './call-state';

it('the pre-transcription client reducer ignores both unknown protocol types', () => {
  expect(
    reduceCallState(INITIAL_CALL_STATE, {
      type: 'transcription.state',
      state: {
        active: true,
        sessionId: '44444444-4444-4444-8444-444444444444',
        startedBy: '33333333-3333-4333-8333-333333333333',
        language: 'vi',
        consentRequired: true,
      },
    })
  ).toBe(INITIAL_CALL_STATE);
  expect(
    reduceCallState(INITIAL_CALL_STATE, {
      type: 'transcription.consent',
      userId: '33333333-3333-4333-8333-333333333333',
      allowed: true,
    })
  ).toBe(INITIAL_CALL_STATE);
});
