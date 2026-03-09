import { type NextRequest, NextResponse } from 'next/server';

export const MAX_EMOJIS_PER_FIELD = 10;

export type EmojiLimitViolation = {
  emojiCount: number;
  path: string;
};

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
const FLAG_RE = /^(?:\p{Regional_Indicator}{2})$/u;
const KEYCAP_RE = /^(?:[#*0-9]\uFE0F?\u20E3)$/u;
const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function hasJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;

  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return normalized === 'application/json' || !!normalized?.endsWith('+json');
}

function getTrustedBypassTokens(): string[] {
  return [
    process.env.CRON_SECRET,
    process.env.VERCEL_CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]
    .map((token) => token?.trim())
    .filter((token): token is string => Boolean(token));
}

function getGraphemeSegments(value: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(value);
  }

  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}

export function countEmojisInString(value: string): number {
  let emojiCount = 0;

  for (const segment of getGraphemeSegments(value)) {
    if (
      EXTENDED_PICTOGRAPHIC_RE.test(segment) ||
      FLAG_RE.test(segment) ||
      KEYCAP_RE.test(segment)
    ) {
      emojiCount += 1;
    }
  }

  return emojiCount;
}

export function findEmojiLimitViolation(
  value: unknown,
  path = 'body'
): EmojiLimitViolation | null {
  if (typeof value === 'string') {
    const emojiCount = countEmojisInString(value);
    if (emojiCount > MAX_EMOJIS_PER_FIELD) {
      return { path, emojiCount };
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const violation = findEmojiLimitViolation(item, `${path}[${index}]`);
      if (violation) {
        return violation;
      }
    }

    return null;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const violation = findEmojiLimitViolation(item, `${path}.${key}`);
      if (violation) {
        return violation;
      }
    }
  }

  return null;
}

export function shouldValidateEmojiLimit(
  request: Pick<NextRequest, 'method' | 'headers'>
): boolean {
  return (
    BODY_METHODS.has(request.method.toUpperCase()) &&
    hasJsonContentType(request.headers.get('content-type'))
  );
}

export function isTrustedEmojiBypassRequest(
  request: Pick<NextRequest, 'headers'>
): boolean {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) {
    return false;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return false;
  }

  const token = match[1]?.trim();
  return token ? getTrustedBypassTokens().includes(token) : false;
}

export async function getEmojiLimitViolationForRequest(
  request: NextRequest
): Promise<EmojiLimitViolation | null> {
  if (
    !shouldValidateEmojiLimit(request) ||
    isTrustedEmojiBypassRequest(request)
  ) {
    return null;
  }

  let rawBody = '';
  try {
    rawBody = await request.clone().text();
  } catch {
    return null;
  }

  if (!rawBody.trim()) {
    return null;
  }

  try {
    return findEmojiLimitViolation(JSON.parse(rawBody));
  } catch {
    // Let route handlers keep their own invalid JSON behavior.
    return null;
  }
}

export function createEmojiLimitExceededResponse(
  violation: EmojiLimitViolation
): NextResponse {
  return NextResponse.json(
    {
      error: 'Bad Request',
      message: `Field "${violation.path}" cannot contain more than ${MAX_EMOJIS_PER_FIELD} emojis`,
      code: 'EMOJI_LIMIT_EXCEEDED',
      field: violation.path,
      emojiCount: violation.emojiCount,
      limit: MAX_EMOJIS_PER_FIELD,
    },
    { status: 400 }
  );
}

export async function validateRequestEmojiLimit(
  request: NextRequest
): Promise<NextResponse | null> {
  const violation = await getEmojiLimitViolationForRequest(request);
  return violation ? createEmojiLimitExceededResponse(violation) : null;
}
