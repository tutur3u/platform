/**
 * getDisplayMedia hints. The browser's picker and the operating system decide
 * which audio sources exist; these only say what Meet accepts:
 * - a browser tab's audio, a window's audio where the browser offers it, and
 *   whole-system audio when the user shares an entire screen;
 * - `restrictOwnAudio` removes the audio this page plays (remote participants
 *   and Mira) from a system or tab capture, so nobody hears themselves back.
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
 * - `sharing`: the capture carries audio;
 * - `tab_audio_off`: a tab was shared without its audio;
 * - `window_audio_unavailable`: this browser offers no audio for a window;
 * - `system_audio_off`: a screen was shared without system audio, although
 *   the browser accepts the request (the option was off, or the operating
 *   system did not offer it);
 * - `system_audio_unsupported`: this browser cannot share system audio;
 * - `unknown`: the browser does not report what was shared.
 */
export type ScreenAudioReason =
  | 'sharing'
  | 'system_audio_off'
  | 'system_audio_unsupported'
  | 'tab_audio_off'
  | 'unknown'
  | 'window_audio_unavailable';

export interface ScreenAudioState {
  surface: ScreenCaptureSurface;
  hasAudio: boolean;
  reason: ScreenAudioReason;
}

type SupportedConstraints = Partial<Record<string, boolean>>;

function surfaceOf(stream: MediaStream): ScreenCaptureSurface {
  const settings = stream.getVideoTracks()[0]?.getSettings?.() as
    | (MediaTrackSettings & { displaySurface?: string })
    | undefined;
  const surface = settings?.displaySurface;
  return surface === 'browser' || surface === 'monitor' || surface === 'window'
    ? surface
    : 'unknown';
}

/**
 * Whether this browser understands the system-audio request. Browsers that
 * implement `restrictOwnAudio` are the ones that also offer the system-audio
 * option for an entire screen; others ignore `systemAudio`. This reads
 * capabilities, never the user agent.
 */
export function browserAcceptsSystemAudio(
  supported:
    | SupportedConstraints
    | undefined = globalThis.navigator?.mediaDevices?.getSupportedConstraints?.() as
    | SupportedConstraints
    | undefined
) {
  return Boolean(supported?.restrictOwnAudio);
}

/** Classifies a captured screen stream for the notice. */
export function describeScreenAudio(
  stream: MediaStream,
  acceptsSystemAudio = browserAcceptsSystemAudio()
): ScreenAudioState {
  const surface = surfaceOf(stream);
  const hasAudio = stream
    .getAudioTracks()
    .some((track) => track.readyState !== 'ended');
  if (hasAudio) return { hasAudio, reason: 'sharing', surface };
  switch (surface) {
    case 'browser':
      return { hasAudio, reason: 'tab_audio_off', surface };
    case 'window':
      return { hasAudio, reason: 'window_audio_unavailable', surface };
    case 'monitor':
      return {
        hasAudio,
        reason: acceptsSystemAudio
          ? 'system_audio_off'
          : 'system_audio_unsupported',
        surface,
      };
    default:
      return { hasAudio, reason: 'unknown', surface };
  }
}
