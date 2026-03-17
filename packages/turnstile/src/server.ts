const DEFAULT_DEV_MODE = process.env.NODE_ENV === 'development';
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_TIMEOUT_MS = 5000;

export interface TurnstileRequestLike {
  headers: Headers;
}

export type TurnstileErrorCode =
  | 'not_configured'
  | 'required'
  | 'verification_failed';

export class TurnstileError extends Error {
  code: TurnstileErrorCode;

  constructor(code: TurnstileErrorCode, message: string) {
    super(message);
    this.name = 'TurnstileError';
    this.code = code;
  }
}

function normalizeEnvValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readHeader(headers: Headers, name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
}

export function isTurnstileError(error: unknown): error is TurnstileError {
  return error instanceof TurnstileError;
}

export function extractTurnstileRemoteIp(request: TurnstileRequestLike) {
  const cfConnectingIp = normalizeEnvValue(
    readHeader(request.headers, 'cf-connecting-ip')
  );
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const trueClientIp = normalizeEnvValue(
    readHeader(request.headers, 'true-client-ip')
  );
  if (trueClientIp) {
    return trueClientIp;
  }

  const realIp = normalizeEnvValue(readHeader(request.headers, 'x-real-ip'));
  if (realIp) {
    return realIp;
  }

  const forwardedFor = normalizeEnvValue(
    readHeader(request.headers, 'x-forwarded-for')
  );

  return forwardedFor?.split(',')[0]?.trim() || undefined;
}

export interface ResolveTurnstileTokenOptions {
  devMode?: boolean;
  token?: string;
}

export interface ResolvedTurnstileToken {
  siteKey?: string;
  captchaToken?: string;
  isRequired: boolean;
}

export function resolveTurnstileToken(
  options: ResolveTurnstileTokenOptions = {}
): ResolvedTurnstileToken {
  const devMode = options.devMode ?? DEFAULT_DEV_MODE;
  const siteKey = normalizeEnvValue(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const token = normalizeEnvValue(options.token);

  if (!devMode && !siteKey) {
    throw new TurnstileError('not_configured', 'Turnstile is not configured');
  }

  if (!devMode && !token) {
    throw new TurnstileError('required', 'Turnstile verification is required');
  }

  return {
    siteKey,
    captchaToken: token,
    isRequired: !devMode,
  };
}

export interface VerifyTurnstileTokenOptions {
  token?: string;
  timeoutMs?: number;
}

export async function verifyTurnstileToken(
  request: TurnstileRequestLike,
  options: VerifyTurnstileTokenOptions = {}
) {
  const secretKey = normalizeEnvValue(process.env.TURNSTILE_SECRET_KEY);

  if (!secretKey) {
    throw new TurnstileError('not_configured', 'Turnstile is not configured');
  }

  const normalizedToken = normalizeEnvValue(options.token);
  if (!normalizedToken) {
    throw new TurnstileError('required', 'Turnstile verification is required');
  }

  const remoteIp = extractTurnstileRemoteIp(request);
  const body = new URLSearchParams({
    secret: secretKey,
    response: normalizedToken,
  });

  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new TurnstileError(
      'verification_failed',
      'Turnstile verification failed'
    );
  }

  const result = (await response.json()) as { success?: boolean };
  if (!result.success) {
    throw new TurnstileError(
      'verification_failed',
      'Turnstile verification failed'
    );
  }
}
