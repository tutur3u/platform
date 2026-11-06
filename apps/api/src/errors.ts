export type ErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'rate_limited'
  | 'unavailable'
  | 'deadline_exceeded'
  | 'invalid_output'
  | 'internal_error';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export type ErrorEncoding = 'canonical' | 'legacy-error' | 'legacy-message';

export function encodeError(
  error: ApiError,
  requestId: string,
  encoding: ErrorEncoding = 'canonical'
): Response {
  const message = error.status >= 500 ? 'Service unavailable' : error.message;
  const body =
    encoding === 'legacy-error'
      ? { error: message }
      : encoding === 'legacy-message'
        ? { message }
        : { error: { code: error.code, message, requestId } };
  return Response.json(body, {
    status: error.status,
    headers: { 'cache-control': 'no-store' },
  });
}
