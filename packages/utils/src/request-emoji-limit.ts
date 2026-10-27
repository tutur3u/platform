import { type NextRequest, NextResponse } from 'next/server';

export const MAX_EMOJIS_PER_FIELD = 10;
export const MAX_SHORT_TEXT_FIELD_GRAPHEMES = 280;
/** Form description, task description, etc. Allow up to 100k to match database limits. */
export const MAX_DESCRIPTION_FIELD_GRAPHEMES = 100_000;

export type RequestContentViolation = {
  code:
    | 'EMOJI_LIMIT_EXCEEDED'
    | 'TEXT_BOMB_DETECTED'
    | 'REQUEST_COMPLEXITY_EXCEEDED';
  count: number;
  limit: number;
  message: string;
  path: string;
};

type FindRequestContentViolationOptions = {
  skipValidationForFields?: string[];
  skipEmojiCheckForFields?: string[];
  skipShortTextLengthCheckForFields?: string[];
};

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
const FLAG_RE = /^(?:\p{Regional_Indicator}{2})$/u;
const KEYCAP_RE = /^(?:[#*0-9]\uFE0F?\u20E3)$/u;
const DESCRIPTION_FIELD_NAMES = new Set(['description']);
const SHORT_TEXT_FIELD_NAMES = new Set([
  'alias',
  'category',
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

function isDescriptionFieldPath(path: string): boolean {
  const fieldName = getLastFieldName(path);
  return fieldName ? DESCRIPTION_FIELD_NAMES.has(fieldName) : false;
}

function getStringContentViolation(
  value: string,
  path: string,
  options?: FindRequestContentViolationOptions
): RequestContentViolation | null {
  const lastFieldName = getLastFieldName(path);
  const shouldSkipValidationForField =
    !!lastFieldName &&
    (options?.skipValidationForFields ?? []).includes(lastFieldName);

  if (shouldSkipValidationForField) {
    return null;
  }

  const shouldSkipEmojiLimitForField =
    !!lastFieldName &&
    (options?.skipEmojiCheckForFields ?? []).includes(lastFieldName);

  if (!shouldSkipEmojiLimitForField) {
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
  }

  const graphemes = getGraphemeSegments(value);
  if (isDescriptionFieldPath(path)) {
    if (graphemes.length > MAX_DESCRIPTION_FIELD_GRAPHEMES) {
      return {
        code: 'TEXT_BOMB_DETECTED',
        count: graphemes.length,
        limit: MAX_DESCRIPTION_FIELD_GRAPHEMES,
        message: `Field "${path}" exceeds the maximum description length`,
        path,
      };
    }
  } else if (
    isShortTextFieldPath(path) &&
    !(
      !!lastFieldName &&
      (options?.skipShortTextLengthCheckForFields ?? []).includes(lastFieldName)
    ) &&
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

const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_CONTENT_DEPTH = 32;
const MAX_CONTENT_NODES = 10_000;
const MAX_CONTENT_PATH_LENGTH = 2048;

function complexityViolation(
  count: number,
  limit: number
): RequestContentViolation {
  return {
    code: 'REQUEST_COMPLEXITY_EXCEEDED',
    count,
    limit,
    message: 'Request content exceeds validation limits',
    path: 'body',
  };
}

function findComplexityViolation(
  value: unknown,
  path: string
): RequestContentViolation | null {
  const stack = [{ value, depth: 0, pathLength: path.length }];
  let nodes = 1;
  let textSize = 0;
  while (stack.length) {
    const item = stack.pop();
    if (!item) break;
    if (item.depth > MAX_CONTENT_DEPTH)
      return complexityViolation(item.depth, MAX_CONTENT_DEPTH);
    if (item.pathLength > MAX_CONTENT_PATH_LENGTH)
      return complexityViolation(item.pathLength, MAX_CONTENT_PATH_LENGTH);
    if (typeof item.value === 'string') textSize += item.value.length;
    if (item.value && typeof item.value === 'object') {
      for (const key in item.value) {
        if (!Object.hasOwn(item.value, key)) continue;
        nodes += 1;
        if (nodes > MAX_CONTENT_NODES)
          return complexityViolation(nodes, MAX_CONTENT_NODES);
        textSize += key.length;
        const pathLength = item.pathLength + key.length + 2;
        if (pathLength > MAX_CONTENT_PATH_LENGTH)
          return complexityViolation(pathLength, MAX_CONTENT_PATH_LENGTH);
        const child: unknown = Reflect.get(item.value, key);
        stack.push({ value: child, depth: item.depth + 1, pathLength });
      }
    }
    if (textSize > MAX_CONTENT_BYTES)
      return complexityViolation(textSize, MAX_CONTENT_BYTES);
  }
  return null;
}

export function findRequestContentViolation(
  value: unknown,
  path = 'body',
  options?: FindRequestContentViolationOptions
): RequestContentViolation | null {
  return (
    findComplexityViolation(value, path) ??
    visitRequestContent(value, path, options)
  );
}

function visitRequestContent(
  value: unknown,
  path = 'body',
  options?: FindRequestContentViolationOptions
): RequestContentViolation | null {
  if (typeof value === 'string') {
    return getStringContentViolation(value, path, options);
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const violation = visitRequestContent(item, `${path}[${index}]`, options);
      if (violation) {
        return violation;
      }
    }

    return null;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const violation = visitRequestContent(item, `${path}.${key}`, options);
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
  options?: {
    allowDescriptionYjsState?: boolean;
    skipValidationForFields?: string[];
  }
): Promise<RequestContentViolation | null> {
  if (
    !shouldValidateEmojiLimit(request) ||
    isTrustedEmojiBypassRequest(request)
  ) {
    return null;
  }

  let rawBody = '';
  try {
    const body = request.clone().body;
    if (!body) return null;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_CONTENT_BYTES) {
          void reader.cancel().catch(() => {});
          return complexityViolation(bytes, MAX_CONTENT_BYTES);
        }
        rawBody += decoder.decode(chunk.value, { stream: true });
      }
      rawBody += decoder.decode();
    } finally {
      reader.releaseLock();
    }
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
      const {
        description,
        // Explicitly strip description_yjs_state from validation when allowed
        // so Yjs payloads do not trigger short-field or emoji limits.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        description_yjs_state,
        ...rest
      } = parsedBody as {
        description: string;
        description_yjs_state?: unknown;
        [key: string]: unknown;
      };

      return findRequestContentViolation(
        {
          ...rest,
          description,
        },
        'body',
        {
          skipValidationForFields: options?.skipValidationForFields,
          skipEmojiCheckForFields: ['description'],
          skipShortTextLengthCheckForFields: ['description'],
        }
      );
    }

    return findRequestContentViolation(parsedBody, 'body', {
      skipValidationForFields: options?.skipValidationForFields,
    });
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
  options?: {
    allowDescriptionYjsState?: boolean;
    skipValidationForFields?: string[];
  }
): Promise<NextResponse | null> {
  const violation = await getRequestContentViolationForRequest(
    request,
    options
  );
  return violation ? createRequestContentViolationResponse(violation) : null;
}
