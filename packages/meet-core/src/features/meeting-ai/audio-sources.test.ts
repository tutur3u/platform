import { afterEach, expect, it, vi } from 'vitest';
import { meetingAudioSources } from './audio-sources';

afterEach(() => vi.unstubAllGlobals());
it('labels screen-only audio as shared audio even when a microphone is absent', () => {
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(private tracks: MediaStreamTrack[]) {}
      getAudioTracks() {
        return this.tracks;
      }
    }
  );
  const screen = { id: 'screen' } as MediaStreamTrack;
  const mic = { id: 'mic' } as MediaStreamTrack;
  const input = {
    localStream: null,
    screenStream: null,
    selfUserId: null,
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
