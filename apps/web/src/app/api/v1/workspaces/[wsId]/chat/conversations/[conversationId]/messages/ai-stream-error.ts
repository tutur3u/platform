// Upstream error text is untrusted. Only this fixed public message and
// explicitly allowlisted denial codes cross the native Chat boundary.
export class AiStreamError extends Error {
  readonly code = 'ai_response_unavailable';

  constructor() {
    super('AI response unavailable');
    this.name = 'AiStreamError';
  }
}

export const SAFE_AI_DENIAL_CODES = new Set([
  'ACCESS_DENIED',
  'CHATGPT_CONNECTION_REQUIRED',
  'CREDIT_CHECK_FAILED',
  'CREDITS_EXHAUSTED',
  'DAILY_LIMIT_REACHED',
  'DAILY_REQUEST_LIMIT_REACHED',
  'FEATURE_NOT_ALLOWED',
  'INSUFFICIENT_CREDITS',
  'INVALID_CREDIT_SOURCE',
  'MODEL_DISABLED',
  'MODEL_NOT_ALLOWED',
  'NO_ALLOCATION',
  'NO_BALANCE',
  'PERSONAL_WORKSPACE_NOT_FOUND',
  'PLAN_REQUIRED',
  'WORKSPACE_ACCESS_DENIED',
]);

const SAFE_503_DENIAL_CODES = new Set(['CREDIT_CHECK_FAILED', 'NO_ALLOCATION']);

export class AiDenialError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super('AI response unavailable');
    this.name = 'AiDenialError';
    this.code = code;
    this.status = status;
  }
}

export function extractSafeAiDenial(
  status: number,
  bodyText: string
): AiDenialError | null {
  if (status !== 402 && status !== 403 && status !== 503) return null;

  let code: string | null = null;
  if (bodyText.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(bodyText) as { code?: unknown };
      if (
        typeof parsed.code === 'string' &&
        SAFE_AI_DENIAL_CODES.has(parsed.code)
      ) {
        code = parsed.code;
      }
    } catch {
      code = null;
    }
  }

  if (status === 503) {
    if (!code || !SAFE_503_DENIAL_CODES.has(code)) return null;
    return new AiDenialError(code, 503);
  }

  return new AiDenialError(
    code ?? (status === 402 ? 'CREDITS_EXHAUSTED' : 'ACCESS_DENIED'),
    status
  );
}
