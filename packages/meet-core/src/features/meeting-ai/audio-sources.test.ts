import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { meetingAudioSources } from './audio-sources';

const screen = { id: 'screen' } as MediaStreamTrack;
const mic = { id: 'mic' } as MediaStreamTrack;
const allowed = new Set(['person']);

beforeEach(() =>
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(private tracks: MediaStreamTrack[]) {}
      getAudioTracks() {
        return this.tracks;
      }
    }
  )
);
afterEach(() => vi.unstubAllGlobals());

it('labels screen-only audio as shared audio even when a microphone is absent', () => {
  const input = {
    localStream: null,
    screenStream: null,
    selfUserId: null,
    allowedAccountIds: allowed,
    remoteMedia: { device: { screen_audio: screen } },
    participants: {
      device: { accountId: 'person', media: { screenEnabled: true } },
    },
  };
  const sources = meetingAudioSources(input as never);
  expect(sources[0]).toMatchObject({
    accountId: 'person',
    kind: 'shared_audio',
  });
  expect(sources[0]?.stream.getAudioTracks()).toEqual([screen]);
  expect(
    meetingAudioSources({
      ...input,
      remoteMedia: { device: { audio: mic, screen_audio: screen } },
    } as never).map((source) => source.kind)
  ).toEqual(['microphone', 'shared_audio']);
  expect(
    meetingAudioSources({
      ...input,
      participants: {
        device: { accountId: 'person', media: { screenEnabled: false } },
      },
    } as never)
  ).toEqual([]);
});

it('excludes participants who have not allowed or who declined transcription', () => {
  const input = {
    localStream: null,
    screenStream: null,
    selfUserId: null,
    remoteMedia: {
      a: { audio: mic },
      b: { audio: mic },
      guest: { audio: mic },
    },
    participants: {
      a: { accountId: 'person', media: { screenEnabled: false } },
      b: { accountId: 'declined', media: { screenEnabled: false } },
      guest: { userId: 'guest', media: { screenEnabled: false } },
    },
  };
  expect(meetingAudioSources(input as never)).toEqual([]);
  expect(
    meetingAudioSources({
      ...input,
      allowedAccountIds: allowed,
    } as never).map((source) => source.accountId)
  ).toEqual(['person']);
});

it('keeps the host microphone in a solo meeting and honours a host decline', () => {
  const local = { id: 'local' } as unknown as MediaStream;
  const input = {
    localStream: local,
    screenStream: null,
    selfUserId: 'me',
    selfAccountId: 'host-account',
    remoteMedia: {},
    participants: {},
  };
  expect(meetingAudioSources(input as never)).toEqual([
    { stream: local, accountId: 'host-account', kind: 'microphone' },
  ]);
  expect(
    meetingAudioSources({ ...input, selfAllowed: false } as never)
  ).toEqual([]);
});

it('leaves host screen audio out once more than one other person joins', () => {
  const local = { id: 'local' } as unknown as MediaStream;
  const screen = { id: 'screen' } as unknown as MediaStream;
  const person = { media: { screenEnabled: false } };
  const input = {
    localStream: local,
    screenStream: screen,
    selfUserId: 'me',
    selfAccountId: 'host-account',
    remoteMedia: {},
    participants: { me: person, a: person },
  };
  expect(
    meetingAudioSources(input as never).map((source) => source.kind)
  ).toEqual(['microphone', 'shared_audio']);
  expect(
    meetingAudioSources({
      ...input,
      participants: { me: person, a: person, b: person },
    } as never).map((source) => source.kind)
  ).toEqual(['microphone']);
});
