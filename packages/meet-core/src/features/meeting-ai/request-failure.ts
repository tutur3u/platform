/** Only fixed diagnostic codes and valid HTTP status values cross the UI boundary. */
const codes = new Set([
  'MEET_AI_NOT_CONFIGURED',
  'MEET_AI_PROVIDER_UNAVAILABLE',
  'MEET_AI_PROVIDER_LIMIT',
  'MEET_AI_PROVIDER_TIMEOUT',
  'MEET_AI_PROVIDER_NETWORK',
  'MEET_AI_PROCESSING_FAILED',
  'MEET_AI_CREDIT_CHECK_FAILED',
  'MEET_AI_CREDITS_EXHAUSTED',
  'MEET_AI_CREDITS_DAILY_LIMIT',
  'MEET_AI_MODEL_NOT_ON_PLAN',
  'MEET_AI_CREDITS_UNAVAILABLE',
]);
const creditReasons: Record<string, MeetingAiCreditReason> = {
  MEET_AI_CREDITS_EXHAUSTED: 'credits_exhausted',
  MEET_AI_CREDITS_DAILY_LIMIT: 'credits_daily_limit',
  MEET_AI_MODEL_NOT_ON_PLAN: 'credits_model_not_on_plan',
};
export type MeetingAiCreditReason =
  | 'credits_exhausted'
  | 'credits_daily_limit'
  | 'credits_model_not_on_plan'
  | 'credits_unavailable';

export function meetingAiRequestFailure(error: unknown) {
  const record = typeof error === 'object' && error !== null ? error : {};
  const rawStatus = 'status' in record ? record.status : undefined;
  const status =
    typeof rawStatus === 'number' &&
    Number.isInteger(rawStatus) &&
    rawStatus >= 400 &&
    rawStatus <= 599
      ? rawStatus
      : null;
  const rawCode = 'code' in record ? record.code : undefined;
  const code =
    typeof rawCode === 'string' && codes.has(rawCode) ? rawCode : null;
  const key =
    status === 402
      ? 'failure_credits'
      : status === 401 || status === 403
        ? 'failure_access'
        : status === 409
          ? 'failure_conflict'
          : code === 'MEET_AI_PROVIDER_LIMIT' || status === 429
            ? 'failure_limit'
            : status === 502 ||
                status === 503 ||
                status === 504 ||
                code?.startsWith('MEET_AI_PROVIDER_') ||
                code === 'MEET_AI_NOT_CONFIGURED' ||
                code === 'MEET_AI_PROCESSING_FAILED'
              ? 'failure_unavailable'
              : null;
  return { status, code, key } as const;
}

/** A 402 is a billing refusal that every later upload window would repeat. */
export function meetingAiCreditReason(
  error: unknown
): MeetingAiCreditReason | null {
  const { status, code } = meetingAiRequestFailure(error);
  if (status !== 402) return null;
  return (code && creditReasons[code]) || 'credits_unavailable';
}

export function meetingAiGenerationFailureCode(reason: unknown) {
  switch (reason) {
    case 'missing_configuration':
      return 'MEET_AI_NOT_CONFIGURED';
    case 'quota_exceeded':
      return 'MEET_AI_PROVIDER_LIMIT';
    case 'timeout':
      return 'MEET_AI_PROVIDER_TIMEOUT';
    case 'network_error':
      return 'MEET_AI_PROVIDER_NETWORK';
    case 'invalid_api_key':
    case 'api_disabled':
    case 'unsupported_location':
    case 'access_denied':
    case 'model_not_found':
    case 'provider_rejected_request':
      return 'MEET_AI_PROVIDER_UNAVAILABLE';
    default:
      return 'MEET_AI_PROCESSING_FAILED';
  }
}
