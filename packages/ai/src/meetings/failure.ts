import { APICallError } from 'ai';

/** Never include provider messages, request bodies, URLs, or credentials in logs. */
export function describeMeetAiFailure(error: unknown) {
  const apiError = APICallError.isInstance(error) ? error : null;
  const message = error instanceof Error ? error.message : '';
  const status = apiError?.statusCode ?? null;
  const reason = /api.?key.*(invalid|not valid|expired)|API_KEY_INVALID/i.test(
    message
  )
    ? 'invalid_api_key'
    : /api.*(disabled|not been used)|SERVICE_DISABLED/i.test(message)
      ? 'api_disabled'
      : /location.*not supported|unsupported.*location/i.test(message)
        ? 'unsupported_location'
        : status === 429
          ? 'quota_exceeded'
          : status === 401 || status === 403
            ? 'access_denied'
            : status === 404
              ? 'model_not_found'
              : /timeout|timed out|aborted/i.test(message)
                ? 'timeout'
                : /fetch failed|network|connection/i.test(message)
                  ? 'network_error'
                  : apiError
                    ? 'provider_rejected_request'
                    : 'runtime_error';
  return { reason, providerStatus: status };
}

export class MeetAiGenerationError extends Error {
  constructor() {
    super('Meeting AI provider request failed');
    this.name = 'MeetAiGenerationError';
  }
}
