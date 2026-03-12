import { NextResponse } from 'next/server';

type PostgrestLikeError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function tryParseJson(value: string | null | undefined): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getPostgrestRateLimitMetadata(error: PostgrestLikeError): {
  retryAfter: number | null;
} | null {
  const messageJson = tryParseJson(error.message);
  const detailsJson = tryParseJson(error.details) as {
    headers?: Record<string, string | number | null | undefined>;
    status?: number;
  } | null;

  const errorCodeFromMessage =
    messageJson && typeof messageJson === 'object' && 'code' in messageJson
      ? (messageJson.code as string | undefined)
      : undefined;

  const statusFromDetails = detailsJson?.status;
  const retryAfterHeader = detailsJson?.headers?.['Retry-After'];
  const retryAfter =
    typeof retryAfterHeader === 'number'
      ? retryAfterHeader
      : typeof retryAfterHeader === 'string'
        ? Number.parseInt(retryAfterHeader, 10)
        : Number.NaN;

  if (
    error.code !== 'RATE_LIMITED' &&
    errorCodeFromMessage !== 'RATE_LIMITED'
  ) {
    return null;
  }

  if (statusFromDetails !== 429) {
    return null;
  }

  return {
    retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
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
