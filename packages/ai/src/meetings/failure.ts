import { APICallError } from 'ai';

export class MeetAiGenerationError extends Error {
  constructor(public readonly status: 500 | 502 = 502) {
    super(
      status === 500
        ? 'Meeting AI is not configured'
        : 'Meeting AI provider request failed'
    );
    this.name = 'MeetAiGenerationError';
  }
}

/** Never include provider messages, request bodies, URLs, or credentials in logs. */
export function describeMeetAiFailure(error: unknown) {
  const apiError = APICallError.isInstance(error) ? error : null;
  const message = error instanceof Error ? error.message : '';
  const providerStatus = apiError?.statusCode ?? null;
  const result = (reason: string) => ({ reason, providerStatus });
  if (error instanceof MeetAiGenerationError && error.status === 500)
    return result('missing_configuration');
  if (/api.?key.*(invalid|not valid|expired)|API_KEY_INVALID/i.test(message))
    return result('invalid_api_key');
  if (/api.*(disabled|not been used)|SERVICE_DISABLED/i.test(message))
    return result('api_disabled');
  if (/location.*not supported|unsupported.*location/i.test(message))
    return result('unsupported_location');
  if (providerStatus === 429) return result('quota_exceeded');
  if (providerStatus === 401 || providerStatus === 403)
    return result('access_denied');
  if (providerStatus === 404) return result('model_not_found');
  if (/timeout|timed out|aborted/i.test(message)) return result('timeout');
  if (/fetch failed|network|connection/i.test(message))
    return result('network_error');
  return result(apiError ? 'provider_rejected_request' : 'runtime_error');
}
