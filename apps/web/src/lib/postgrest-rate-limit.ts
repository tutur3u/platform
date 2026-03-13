import { NextResponse } from 'next/server';

type PostgrestLikeError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

type PostgrestRateLimitDetails = {
  headers?: Record<string, string | number | null | undefined>;
  status?: number;
};

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getRetryAfterSeconds(
  error: PostgrestLikeError,
  details: PostgrestRateLimitDetails | null
) {
  const retryAfterValue = details?.headers?.['Retry-After'] ?? error.details;

  if (typeof retryAfterValue === 'number') {
    return Number.isFinite(retryAfterValue) ? retryAfterValue : null;
  }

  if (typeof retryAfterValue !== 'string') {
    return null;
  }

  const directValue = Number.parseInt(retryAfterValue, 10);
  if (!Number.isNaN(directValue)) {
    return directValue;
  }

  const match = retryAfterValue.match(/retry after\s+(\d+)\s+seconds/i)?.[1];
  return match ? Number.parseInt(match, 10) : null;
}

export function getPostgrestRateLimitMetadata(error: PostgrestLikeError): {
  retryAfter: number | null;
} | null {
  const message = parseJson<{ code?: string }>(error.message);
  const details = parseJson<PostgrestRateLimitDetails>(error.details);

  const isRateLimited =
    error.code === 'RATE_LIMITED' ||
    (error.code === 'PGRST' && message?.code === 'RATE_LIMITED');

  if (!isRateLimited) {
    return null;
  }

  if (details?.status !== undefined && details.status !== 429) {
    return null;
  }

  return {
    retryAfter: getRetryAfterSeconds(error, details),
  };
}

export function buildPostgrestRateLimitResponse(error: PostgrestLikeError) {
  const metadata = getPostgrestRateLimitMetadata(error);
  if (!metadata) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (metadata.retryAfter !== null && metadata.retryAfter > 0) {
    headers['Retry-After'] = `${metadata.retryAfter}`;
  }

  return NextResponse.json(
    { error: 'Too Many Requests', message: 'Rate limit exceeded' },
    { status: 429, headers }
  );
}
