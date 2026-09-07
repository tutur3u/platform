import { APICallError } from 'ai';

type MeetAiFailureReason =
  | 'missing_configuration'
  | 'invalid_api_key'
  | 'api_disabled'
  | 'unsupported_location'
  | 'quota_exceeded'
  | 'access_denied'
  | 'model_not_found'
  | 'timeout'
  | 'network_error'
  | 'provider_rejected_request'
  | 'runtime_error';

export class MeetAiGenerationError extends Error {
  readonly status: 500 | 502;
  constructor(
    public readonly reason: MeetAiFailureReason = 'provider_rejected_request',
    public readonly providerStatus: number | null = null
  ) {
    super(
      reason === 'missing_configuration'
        ? 'Meeting AI is not configured'
        : reason === 'runtime_error'
          ? 'Meeting AI processing failed'
          : 'Meeting AI provider request failed'
    );
    this.name = 'MeetAiGenerationError';
    this.status =
      reason === 'missing_configuration' || reason === 'runtime_error'
        ? 500
        : 502;
  }
}

/** Never include provider messages, request bodies, URLs, or credentials in logs. */
export function describeMeetAiFailure(error: unknown) {
  if (error instanceof MeetAiGenerationError)
    return { reason: error.reason, providerStatus: error.providerStatus };
  const apiError = APICallError.isInstance(error) ? error : null;
  const message = error instanceof Error ? error.message : '';
  const providerStatus = apiError?.statusCode ?? null;
  const result = (reason: MeetAiFailureReason) => ({ reason, providerStatus });
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
