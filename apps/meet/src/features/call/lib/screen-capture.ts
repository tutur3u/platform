/** Browser hints; the chooser and operating system decide available audio sources. */
export const SCREEN_CAPTURE_OPTIONS = {
  video: true,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  systemAudio: 'include',
  windowAudio: 'window',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
} as const;
