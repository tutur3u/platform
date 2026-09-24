import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { expect, it } from 'vitest';
import { miraInputTracks } from './input-sources';

const track = (id: string) => ({ id, readyState: 'live' }) as MediaStreamTrack;
const participant = (userId: string, input?: boolean, mic = true) =>
  ({
    userId,
    displayName: userId,
    role: 'speaker',
    joinedAt: '',
    lastSeenAt: '',
    media: { audioEnabled: mic, videoEnabled: false, screenEnabled: false },
    assistantAudio:
      input === undefined
        ? undefined
        : {
            sessionId: 'session',
            microphoneEnabled: input,
            speakerEnabled: false,
          },
  }) as MeetRealtimePresence;
it('includes only opted-in, unmuted microphones and never shared screen audio', () => {
  const local = track('self'),
    remote = track('remote'),
    screen = track('screen');
  const participants = {
    self: participant('self', true),
    other: participant('other', true),
    muted: participant('muted', false),
    legacy: participant('legacy'),
  };
  const media = {
    other: { audio: remote, screen_audio: screen },
    muted: { audio: track('muted') },
    legacy: { audio: track('legacy') },
  };
  const stream = { getAudioTracks: () => [local] } as MediaStream;
  expect(
    miraInputTracks(participants, 'self', stream, media, 'session')
  ).toEqual([local, remote]);
  participants.self = participant('self', false);
  participants.other = participant('other', true, false);
  expect(
    miraInputTracks(participants, 'self', stream, media, 'session')
  ).toEqual([]);
});

it('never carries microphone consent into a different Live session', () => {
  const participants = { self: participant('self', true) };
  const stream = { getAudioTracks: () => [track('self')] } as MediaStream;
  expect(
    miraInputTracks(participants, 'self', stream, {}, 'new-session')
  ).toEqual([]);
});
