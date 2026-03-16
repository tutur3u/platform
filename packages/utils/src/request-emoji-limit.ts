import { type NextRequest, NextResponse } from 'next/server';

export const MAX_EMOJIS_PER_FIELD = 10;
export const MAX_SHORT_TEXT_FIELD_GRAPHEMES = 280;
export const MAX_REPEATED_GRAPHEME_RUN = 48;

export type RequestContentViolation = {
  code: 'EMOJI_LIMIT_EXCEEDED' | 'TEXT_BOMB_DETECTED';
  count: number;
  limit: number;
  message: string;
  path: string;
};

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
const FLAG_RE = /^(?:\p{Regional_Indicator}{2})$/u;
const KEYCAP_RE = /^(?:[#*0-9]\uFE0F?\u20E3)$/u;
const SHORT_TEXT_FIELD_NAMES = new Set([
  'alias',
  'category',
  'description',
  'displayName',
  'display_name',
  'fullName',
  'full_name',
  'icon',
  'label',
  'name',
  'slug',
  'subject',
  'summary',
  'tag',
  'title',
  'walletName',
  'wallet_name',
]);
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

function getLastFieldName(path: string): string | null {
  const withoutIndexes = path.replace(/\[\d+\]/g, '');
  const segments = withoutIndexes.split('.');
  const lastSegment = segments.at(-1);
  return lastSegment && lastSegment !== 'body' ? lastSegment : null;
}

function isShortTextFieldPath(path: string): boolean {
  const fieldName = getLastFieldName(path);
  return fieldName ? SHORT_TEXT_FIELD_NAMES.has(fieldName) : false;
}

function getLongestRepeatedGraphemeRun(graphemes: string[]): number {
  let longestRun = 0;
  let currentRun = 0;
  let previous = '';

  for (const grapheme of graphemes) {
    if (grapheme === previous) {
      currentRun += 1;
    } else {
      previous = grapheme;
      currentRun = 1;
    }

    if (!grapheme.trim()) {
      currentRun = 0;
      previous = '';
      continue;
    }

    if (currentRun > longestRun) {
      longestRun = currentRun;
    }
  }

  return longestRun;
}

function getStringContentViolation(
  value: string,
  path: string
): RequestContentViolation | null {
  const emojiCount = countEmojisInString(value);
  if (emojiCount > MAX_EMOJIS_PER_FIELD) {
    return {
      code: 'EMOJI_LIMIT_EXCEEDED',
      count: emojiCount,
      limit: MAX_EMOJIS_PER_FIELD,
      message: `Field "${path}" cannot contain more than ${MAX_EMOJIS_PER_FIELD} emojis`,
      path,
    };
  }

  const graphemes = getGraphemeSegments(value);
  const longestRun = getLongestRepeatedGraphemeRun(graphemes);
  if (longestRun > MAX_REPEATED_GRAPHEME_RUN) {
    return {
      code: 'TEXT_BOMB_DETECTED',
      count: longestRun,
      limit: MAX_REPEATED_GRAPHEME_RUN,
      message: `Field "${path}" contains an abusive repeated-character run`,
      path,
    };
  }

  if (
    isShortTextFieldPath(path) &&
    graphemes.length > MAX_SHORT_TEXT_FIELD_GRAPHEMES
  ) {
    return {
      code: 'TEXT_BOMB_DETECTED',
      count: graphemes.length,
      limit: MAX_SHORT_TEXT_FIELD_GRAPHEMES,
      message: `Field "${path}" exceeds the maximum short-field length`,
      path,
    };
  }

  return null;
}

export function findRequestContentViolation(
  value: unknown,
  path = 'body'
): RequestContentViolation | null {
  if (typeof value === 'string') {
    return getStringContentViolation(value, path);
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const violation = findRequestContentViolation(item, `${path}[${index}]`);
      if (violation) {
        return violation;
      }
    }

    return null;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const violation = findRequestContentViolation(item, `${path}.${key}`);
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

export async function getRequestContentViolationForRequest(
  request: NextRequest,
  options?: { allowDescriptionYjsState?: boolean }
): Promise<RequestContentViolation | null> {
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
    const parsedBody = JSON.parse(rawBody);

    if (
      options?.allowDescriptionYjsState === true &&
      parsedBody &&
      typeof parsedBody === 'object' &&
      'description_yjs_state' in parsedBody &&
      typeof (parsedBody as { description?: unknown }).description === 'string'
    ) {
      const { description, ...rest } = parsedBody as {
        description: string;
        [key: string]: unknown;
      };

      return findRequestContentViolation({
        ...rest,
        rich_text_description: description,
      });
    }

    return findRequestContentViolation(parsedBody);
  } catch {
    // Let route handlers keep their own invalid JSON behavior.
    return null;
  }
}

export function createRequestContentViolationResponse(
  violation: RequestContentViolation
): NextResponse {
  return NextResponse.json(
    {
      error: 'Bad Request',
      message: violation.message,
      code: violation.code,
      field: violation.path,
      count: violation.count,
      limit: violation.limit,
    },
    { status: 400 }
  );
}

export async function validateRequestEmojiLimit(
  request: NextRequest,
  options?: { allowDescriptionYjsState?: boolean }
): Promise<NextResponse | null> {
  const violation = await getRequestContentViolationForRequest(
    request,
    options
  );
  return violation ? createRequestContentViolationResponse(violation) : null;
}
