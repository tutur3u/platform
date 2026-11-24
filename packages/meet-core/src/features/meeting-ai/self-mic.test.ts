import { describe, expect, it } from 'vitest';
import { hasConfirmedEchoCancellation, ownMicrophoneTrack } from './self-mic';

const track = (
  settings: () => MediaTrackSettings,
  readyState: MediaStreamTrackState = 'live'
) => ({ readyState, getSettings: settings }) as unknown as MediaStreamTrack;
const streamOf = (...tracks: MediaStreamTrack[]) =>
  ({ getAudioTracks: () => tracks }) as unknown as MediaStream;

describe('own microphone gate', () => {
  it('requires echo cancellation confirmed on the track', () => {
    expect(
      hasConfirmedEchoCancellation(track(() => ({ echoCancellation: true })))
    ).toBe(true);
    expect(
      hasConfirmedEchoCancellation(track(() => ({ echoCancellation: false })))
    ).toBe(false);
    expect(hasConfirmedEchoCancellation(track(() => ({})))).toBe(false);
    expect(
      hasConfirmedEchoCancellation(
        track(() => {
          throw new Error('unsupported');
        })
      )
    ).toBe(false);
    expect(hasConfirmedEchoCancellation(null)).toBe(false);
  });

  it('refuses an ended track even if it once reported echo cancellation', () => {
    expect(
      hasConfirmedEchoCancellation(
        track(() => ({ echoCancellation: true }), 'ended')
      )
    ).toBe(false);
  });

  it('taps the first live audio track of the local stream only', () => {
    const ended = track(() => ({}), 'ended');
    const live = track(() => ({ echoCancellation: true }));
    expect(ownMicrophoneTrack(streamOf(ended, live))).toBe(live);
    expect(ownMicrophoneTrack(streamOf(ended))).toBeNull();
    expect(ownMicrophoneTrack(null)).toBeNull();
  });
});
