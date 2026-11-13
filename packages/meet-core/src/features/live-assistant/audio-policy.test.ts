import { expect, it } from 'vitest';
import {
  acceptsLiveAudio,
  liveClientCommandSchema,
  type LiveSessionClaims,
} from './contracts';
it('denies every room mixer and accepts only private microphone sessions', () => {
  const claims = { mode: 'room' } as LiveSessionClaims;
  expect(acceptsLiveAudio(claims)).toBe(false);
  expect(
    acceptsLiveAudio({ ...claims, audioPolicy: 'participant-opt-in' })
  ).toBe(false);
  expect(acceptsLiveAudio({ ...claims, mode: 'personal' })).toBe(false);
  expect(
    acceptsLiveAudio({
      ...claims,
      mode: 'personal',
      inputSource: 'private-microphone',
    })
  ).toBe(true);
});
it('rejects unlabelled room or remote audio frames at the protocol boundary', () => {
  const base = {
    type: 'audio',
    data: 'synthetic',
    accountId: '00000000-0000-4000-8000-000000000001',
  };
  expect(liveClientCommandSchema.safeParse(base).success).toBe(false);
  expect(
    liveClientCommandSchema.safeParse({ ...base, source: 'room' }).success
  ).toBe(false);
  expect(
    liveClientCommandSchema.safeParse({
      ...base,
      source: 'microphone',
      otherTracks: [],
    }).success
  ).toBe(false);
  expect(
    liveClientCommandSchema.safeParse({ ...base, source: 'microphone' }).success
  ).toBe(true);
});
