export type LiveClientErrorCode =
  | 'LIVE_CONNECTION_FAILED'
  | 'LIVE_CONNECTION_TIMEOUT';

export class LiveClientError extends Error {
  readonly code: LiveClientErrorCode;

  constructor(
    code: LiveClientErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'LiveClientError';
    this.code = code;
  }
}

export function createLiveConnectionError(
  message?: string,
  cause?: unknown
): LiveClientError {
  return new LiveClientError(
    'LIVE_CONNECTION_FAILED',
    message?.trim() || 'Gemini Live rejected the connection.',
    cause === undefined ? undefined : { cause }
  );
}
