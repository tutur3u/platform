import type { PasswordsErrorCode, PasswordsResult } from './port';

export class PasswordsClientError extends Error {
  readonly code: PasswordsErrorCode;
  readonly stepUpUrl?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    code: PasswordsErrorCode,
    extra: { stepUpUrl?: string; retryAfterSeconds?: number } = {}
  ) {
    super(code);
    this.name = 'PasswordsClientError';
    this.code = code;
    this.stepUpUrl = extra.stepUpUrl;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

export function unwrap<T>(result: PasswordsResult<T>): T {
  if (result.ok) return result.value;
  throw new PasswordsClientError(result.code, {
    stepUpUrl: result.stepUpUrl,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

/** A rejected server function (network loss, validation) leaves a write's outcome unknown. */
export function asClientError(error: unknown, uncertain: boolean) {
  if (error instanceof PasswordsClientError) return error;
  return new PasswordsClientError(
    uncertain ? 'OPERATION_UNCERTAIN' : 'UNAVAILABLE'
  );
}
