export type MiraChatDenialKind =
  | 'plan'
  | 'credits'
  | 'daily_limit'
  | 'permission';

export interface MiraChatDenial {
  kind: MiraChatDenialKind;
  status: number;
  code?: string;
}

export class MiraChatRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly serverMessage?: string;

  constructor({
    status,
    code,
    serverMessage,
    message,
  }: {
    status: number;
    code?: string;
    serverMessage?: string;
    message?: string;
  }) {
    super(message ?? serverMessage ?? `Request failed with status ${status}`);
    this.name = 'MiraChatRequestError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

export const MIRA_PRICING_LEARN_MORE_URL = 'https://tuturuuu.com/pricing';
export const MIRA_PERMISSIONS_LEARN_MORE_URL =
  'https://docs.tuturuuu.com/platform/architecture/workspaces-permissions';

const PLAN_DENIAL_CODES = new Set([
  'FEATURE_NOT_ALLOWED',
  'MODEL_DISABLED',
  'MODEL_NOT_ALLOWED',
  'NO_ALLOCATION',
  'PLAN_REQUIRED',
]);

const CREDIT_DENIAL_CODES = new Set([
  'CREDITS_EXHAUSTED',
  'INSUFFICIENT_CREDITS',
  'NO_BALANCE',
]);

const DAILY_LIMIT_DENIAL_CODES = new Set(['DAILY_LIMIT_REACHED']);

const PERMISSION_DENIAL_CODES = new Set([
  'ACCESS_DENIED',
  'INVALID_CREDIT_SOURCE',
  'PERSONAL_WORKSPACE_NOT_FOUND',
  'WORKSPACE_ACCESS_DENIED',
]);

function classifyCode(code?: string): MiraChatDenialKind | null {
  if (!code) return null;
  if (PLAN_DENIAL_CODES.has(code)) return 'plan';
  if (CREDIT_DENIAL_CODES.has(code)) return 'credits';
  if (DAILY_LIMIT_DENIAL_CODES.has(code)) return 'daily_limit';
  if (PERMISSION_DENIAL_CODES.has(code)) return 'permission';
  return null;
}

function classifyMessageText(text?: string): MiraChatDenialKind | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (
    normalized.includes('daily ai') ||
    normalized.includes('daily limit') ||
    normalized.includes('request limit')
  ) {
    return 'daily_limit';
  }
  if (
    normalized.includes('credits have been used up') ||
    normalized.includes('credits insufficient') ||
    normalized.includes('insufficient ai credits') ||
    normalized.includes('out of credits')
  ) {
    return 'credits';
  }
  if (
    normalized.includes('not available on the') ||
    normalized.includes('no credit allocation') ||
    normalized.includes('upgrade your plan') ||
    normalized.includes('plan required')
  ) {
    return 'plan';
  }
  if (
    normalized.includes('workspace access denied') ||
    normalized.includes('insufficient chat permissions') ||
    normalized.includes('permission') ||
    normalized.includes('limited to @tuturuuu.com') ||
    normalized.includes('personal workspace not found') ||
    normalized.includes('invalid credit workspace')
  ) {
    return 'permission';
  }
  return null;
}

function parseJsonBody(raw?: string): { code?: string; message?: string } {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return { message: trimmed };
  try {
    const parsed = JSON.parse(trimmed) as {
      code?: unknown;
      error?: unknown;
      message?: unknown;
    };
    return {
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      message:
        typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.message === 'string'
            ? parsed.message
            : undefined,
    };
  } catch {
    return { message: trimmed };
  }
}

export async function readMiraChatRequestError(
  response: Response
): Promise<MiraChatRequestError> {
  const rawBody = await response.text().catch(() => '');
  const parsed = parseJsonBody(rawBody);
  return new MiraChatRequestError({
    status: response.status,
    code: parsed.code,
    serverMessage: parsed.message,
    message: parsed.message || `Failed to create chat (${response.status})`,
  });
}

export function parseMiraChatDenial(error: unknown): MiraChatDenial | null {
  if (!error || typeof error !== 'object') return null;

  let status: number | undefined;
  let code: string | undefined;
  let serverMessage: string | undefined;

  if (error instanceof MiraChatRequestError) {
    status = error.status;
    code = error.code;
    serverMessage = error.serverMessage ?? error.message;
  } else {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      responseBody?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    if (typeof candidate.statusCode === 'number') {
      status = candidate.statusCode;
    } else if (typeof candidate.status === 'number') {
      status = candidate.status;
    }
    if (typeof candidate.code === 'string') {
      code = candidate.code;
    }
    const rawBody =
      typeof candidate.responseBody === 'string'
        ? candidate.responseBody
        : typeof candidate.message === 'string'
          ? candidate.message
          : undefined;
    const parsed = parseJsonBody(rawBody);
    code ??= parsed.code;
    serverMessage = parsed.message;
  }

  const byCode = classifyCode(code);
  const safeCode = byCode ? code?.trim().toUpperCase() : undefined;
  if (byCode) {
    return {
      kind: byCode,
      status: status ?? 403,
      code: safeCode,
    };
  }

  const byMessage = classifyMessageText(serverMessage);
  if (byMessage && (status === undefined || status === 402 || status === 403)) {
    return {
      kind: byMessage,
      status: status ?? 403,
    };
  }

  if (status === 402) {
    return { kind: 'credits', status: 402 };
  }

  if (status === 403) {
    return { kind: 'permission', status: 403 };
  }

  return null;
}

export function restoreMiraPromptInput(
  currentInput: string,
  prompt: string
): string {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return currentInput;
  if (!currentInput.trim()) return prompt;
  if (currentInput.includes(trimmedPrompt)) return currentInput;
  return `${prompt}\n${currentInput}`;
}
