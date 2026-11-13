import { getMediaErrorKey } from '../call/lib/media-error';

/** Local device and startup failures that have a specific, localized message. */
const LIVE_ERROR_KEYS = {
  microphone_blocked: 'error_microphone_blocked',
  microphone_missing: 'error_microphone_missing',
  microphone_busy: 'error_microphone_busy',
  input_unavailable: 'error_input_unavailable',
  output_unavailable: 'error_output_unavailable',
  start_failed: 'error_start_failed',
} as const;

export type LiveErrorCode = keyof typeof LIVE_ERROR_KEYS;
export type LiveErrorMessageKey =
  | (typeof LIVE_ERROR_KEYS)[LiveErrorCode]
  | 'session_error';

/** A startup failure whose cause is known before any server session exists. */
export class LiveStartError extends Error {
  constructor(readonly code: LiveErrorCode) {
    super(code);
    this.name = 'LiveStartError';
  }
}

/** Maps a getUserMedia rejection to the microphone problem the user can fix. */
export function microphoneErrorCode(error: unknown): LiveErrorCode {
  switch (getMediaErrorKey(error, 'microphone')) {
    case 'media_permission_denied':
      return 'microphone_blocked';
    case 'microphone_not_found':
      return 'microphone_missing';
    case 'media_device_busy':
      return 'microphone_busy';
    default:
      return 'input_unavailable';
  }
}

export function liveStartErrorCode(error: unknown): LiveErrorCode {
  return error instanceof LiveStartError ? error.code : 'start_failed';
}

/** Server-provided details are never rendered; unknown codes use the generic message. */
export function liveErrorMessageKey(error?: string): LiveErrorMessageKey {
  return error && Object.hasOwn(LIVE_ERROR_KEYS, error)
    ? LIVE_ERROR_KEYS[error as LiveErrorCode]
    : 'session_error';
}

/** Rejects when a promise neither settles nor fails, e.g. a stalled AudioContext. */
export function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  timeoutError: () => Error
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
