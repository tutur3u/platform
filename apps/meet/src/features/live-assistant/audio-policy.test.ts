import { expect, it } from 'vitest';
import { acceptsLiveAudio, type LiveSessionClaims } from './contracts';

it('blocks legacy room mixers while preserving private audio and opted-in room sessions', () => {
  const claims = { mode: 'room' } as LiveSessionClaims;
  expect(acceptsLiveAudio(claims)).toBe(false);
  expect(
    acceptsLiveAudio({ ...claims, audioPolicy: 'participant-opt-in' })
  ).toBe(true);
  expect(acceptsLiveAudio({ ...claims, mode: 'personal' })).toBe(true);
});
