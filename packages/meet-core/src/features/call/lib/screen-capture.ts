/**
 * getDisplayMedia hints. The browser's picker and the operating system decide
 * which audio sources exist; these only say what Meet accepts:
 * - a browser tab's audio, a window's audio where the browser offers it, and
 *   whole-system audio when the user shares an entire screen;
 * - `restrictOwnAudio` removes the audio this page plays (remote participants
 *   and Mira) from a system or tab capture, so nobody hears themselves back,
 *   in browsers that implement it.
 *
 * `systemAudio: 'include'` is always requested; a browser that does not offer
 * system audio ignores it.
 *
 * `suppressLocalAudioPlayback` is deliberately not requested: it applies to a
 * tab capture and would silence the shared tab on the sharer's own speakers.
 * The microphone's own echo cancellation is unchanged.
 */
export const SCREEN_CAPTURE_OPTIONS = {
  video: true,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    restrictOwnAudio: true,
  },
  systemAudio: 'include',
  windowAudio: 'window',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
} as const;

export type ScreenCaptureSurface = 'browser' | 'monitor' | 'unknown' | 'window';

/**
 * Why a share has or lacks audio, for the screen-audio notice:
 * - `sharing`: the capture carries live audio;
 * - `pending`: an audio track exists but is not delivering yet (muted), so
 *   nothing is claimed either way;
 * - `tab_audio_off`: a tab was shared without its audio;
 * - `window_audio_unavailable`: this browser offers no audio for a window;
 * - `system_audio_off`: a screen was shared without audio, because the option
 *   was off or this browser cannot share system audio (the text covers both);
 * - `unknown`: the browser does not report what was shared.
 */
export type ScreenAudioReason =
  | 'pending'
  | 'sharing'
  | 'system_audio_off'
  | 'tab_audio_off'
  | 'unknown'
  | 'window_audio_unavailable';

export interface ScreenAudioState {
  surface: ScreenCaptureSurface;
  hasAudio: boolean;
  reason: ScreenAudioReason;
}

function surfaceOf(stream: MediaStream): ScreenCaptureSurface {
  const settings = stream.getVideoTracks()[0]?.getSettings?.() as
    | (MediaTrackSettings & { displaySurface?: string })
    | undefined;
  const surface = settings?.displaySurface;
  return surface === 'browser' || surface === 'monitor' || surface === 'window'
    ? surface
    : 'unknown';
}

/** Classifies a captured screen stream for the notice. */
export function describeScreenAudio(stream: MediaStream): ScreenAudioState {
  const surface = surfaceOf(stream);
  const tracks = stream
    .getAudioTracks()
    .filter((track) => track.readyState !== 'ended');
  if (tracks.some((track) => !track.muted))
    return { hasAudio: true, reason: 'sharing', surface };
  // A track that exists but is muted may still start delivering.
  if (tracks.length) return { hasAudio: true, reason: 'pending', surface };
  const hasAudio = false;
  switch (surface) {
    case 'browser':
      return { hasAudio, reason: 'tab_audio_off', surface };
    case 'window':
      return { hasAudio, reason: 'window_audio_unavailable', surface };
    case 'monitor':
      return { hasAudio, reason: 'system_audio_off', surface };
    default:
      return { hasAudio, reason: 'unknown', surface };
  }
}
