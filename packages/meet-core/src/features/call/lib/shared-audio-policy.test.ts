import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { expect, it } from 'vitest';
import { INITIAL_CALL_STATE } from './call-state';
import type { RemoteMedia } from './remote-streams';
import { existingAccountAudio, overlapPeers } from './shared-audio-policy';

function peer(userId: string, minute: number, accountId = userId) {
  return {
    userId,
    accountId,
    joinedAt: `2026-09-15T10:${String(minute).padStart(2, '0')}:00Z`,
    media: { audioEnabled: true },
  } as MeetRealtimePresence;
}
it('chooses just the later device when both microphones are active, including equal timestamps', () => {
  const participants = {
    a: peer('a', 1, 'account'),
    b: peer('b', 1, 'account'),
  };
  expect(
    existingAccountAudio({
      ...INITIAL_CALL_STATE,
      participants,
      selfUserId: 'a',
    })
  ).toBeNull();
  expect(
    existingAccountAudio({
      ...INITIAL_CALL_STATE,
      participants,
      selfUserId: 'b',
    })?.userId
  ).toBe('a');
  expect(
    existingAccountAudio(
      { ...INITIAL_CALL_STATE, participants, selfUserId: 'a' },
      true
    )?.userId
  ).toBe('b');
});
it('bounds comparison, prioritizes speakers, and excludes screen-only and muted peers', () => {
  const participants = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [String(i), peer(String(i), i)])
  );
  participants.self = peer('self', 30);
  participants['0']!.media.audioEnabled = false;
  const remote = Object.fromEntries(
    Object.keys(participants).map((id) => [
      id,
      { audio: { readyState: 'live' } },
    ])
  ) as unknown as RemoteMedia;
  remote['1'] = { screen_audio: { readyState: 'live' } as MediaStreamTrack };
  const result = overlapPeers(
    {
      ...INITIAL_CALL_STATE,
      participants,
      selfUserId: 'self',
      stage: { ...INITIAL_CALL_STATE.stage, activeSpeakerIds: ['2'] },
    },
    remote
  );
  expect(result).toHaveLength(8);
  expect(result[0]?.userId).toBe('2');
  expect(result.some((p) => ['0', '1', 'self'].includes(p.userId))).toBe(false);
});
