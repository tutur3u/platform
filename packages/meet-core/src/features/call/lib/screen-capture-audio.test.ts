import { describe, expect, it } from 'vitest';
import { describeScreenAudio, SCREEN_CAPTURE_OPTIONS } from './screen-capture';

function stream(
  displaySurface: string | undefined,
  audio: Array<{ muted?: boolean; readyState: 'ended' | 'live' }> = []
) {
  return {
    getAudioTracks: () => audio,
    getVideoTracks: () => [{ getSettings: () => ({ displaySurface }) }],
  } as unknown as MediaStream;
}

describe('screen capture options', () => {
  it('offer system audio for an entire screen and window audio where available', () => {
    expect(SCREEN_CAPTURE_OPTIONS.systemAudio).toBe('include');
    expect(SCREEN_CAPTURE_OPTIONS.windowAudio).toBe('window');
    expect(SCREEN_CAPTURE_OPTIONS.selfBrowserSurface).toBe('exclude');
  });

  it('always set the echo flags and leave shared audio unprocessed', () => {
    expect(SCREEN_CAPTURE_OPTIONS.audio).toEqual({
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
      restrictOwnAudio: true,
    });
  });

  it('does not request local playback suppression, which would mute a shared tab for the sharer', () => {
    expect(SCREEN_CAPTURE_OPTIONS.audio).not.toHaveProperty(
      'suppressLocalAudioPlayback'
    );
    expect(SCREEN_CAPTURE_OPTIONS).not.toHaveProperty(
      'suppressLocalAudioPlayback'
    );
  });
});

describe('describeScreenAudio', () => {
  it.each(['browser', 'monitor', 'window', undefined])(
    'reports sharing whenever a live, unmuted audio track exists (%s)',
    (surface) => {
      expect(
        describeScreenAudio(stream(surface, [{ readyState: 'live' }]))
      ).toMatchObject({ hasAudio: true, reason: 'sharing' });
    }
  );

  it.each([
    ['browser', 'tab_audio_off'],
    ['window', 'window_audio_unavailable'],
    ['monitor', 'system_audio_off'],
    [undefined, 'unknown'],
    ['application', 'unknown'],
  ] as const)('explains a %s share without audio as %s', (surface, reason) => {
    expect(describeScreenAudio(stream(surface))).toMatchObject({
      hasAudio: false,
      reason,
    });
  });

  it('treats an ended audio track as no audio', () => {
    expect(
      describeScreenAudio(stream('monitor', [{ readyState: 'ended' }]))
    ).toMatchObject({ hasAudio: false, reason: 'system_audio_off' });
  });

  it('claims nothing about a live track that is still muted', () => {
    expect(
      describeScreenAudio(
        stream('monitor', [{ muted: true, readyState: 'live' }])
      )
    ).toMatchObject({ hasAudio: true, reason: 'pending' });
  });
});
