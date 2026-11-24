import { describe, expect, it } from 'vitest';
import {
  browserAcceptsSystemAudio,
  describeScreenAudio,
  SCREEN_CAPTURE_OPTIONS,
} from './screen-capture';

function stream(
  displaySurface: string | undefined,
  audio: Array<{ readyState: 'ended' | 'live' }> = []
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
    'reports sharing whenever a live audio track exists (%s)',
    (surface) => {
      expect(
        describeScreenAudio(stream(surface, [{ readyState: 'live' }]), false)
      ).toMatchObject({ hasAudio: true, reason: 'sharing' });
    }
  );

  it.each([
    ['browser', true, 'tab_audio_off'],
    ['window', true, 'window_audio_unavailable'],
    ['monitor', true, 'system_audio_off'],
    ['monitor', false, 'system_audio_unsupported'],
    [undefined, true, 'unknown'],
    ['application', true, 'unknown'],
  ] as const)(
    'explains a %s share without audio (system audio accepted: %s) as %s',
    (surface, accepts, reason) => {
      expect(describeScreenAudio(stream(surface), accepts)).toMatchObject({
        hasAudio: false,
        reason,
      });
    }
  );

  it('treats an ended audio track as no audio', () => {
    expect(
      describeScreenAudio(stream('monitor', [{ readyState: 'ended' }]), true)
    ).toMatchObject({ hasAudio: false, reason: 'system_audio_off' });
  });
});

describe('browserAcceptsSystemAudio', () => {
  it('reads supported constraints, not the user agent', () => {
    expect(browserAcceptsSystemAudio({ restrictOwnAudio: true })).toBe(true);
    // Only restrictOwnAudio marks the system-audio option; local playback
    // suppression is a tab feature.
    expect(
      browserAcceptsSystemAudio({ suppressLocalAudioPlayback: true })
    ).toBe(false);
    expect(browserAcceptsSystemAudio({ echoCancellation: true })).toBe(false);
    expect(browserAcceptsSystemAudio(undefined)).toBe(false);
  });
});
