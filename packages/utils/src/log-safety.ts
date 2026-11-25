const errorNames = new Set([
  'AbortError',
  'AggregateError',
  'AllRecipientsBlockedError',
  'AuthApiError',
  'AuthRetryableFetchError',
  'BlacklistedEmailError',
  'CredentialsError',
  'EmailError',
  'EmailValidationError',
  'Error',
  'InvalidEmailError',
  'MailReadTimeout',
  'MailSendError',
  'MailStorageConfigurationError',
  'NetworkError',
  'NotInitializedError',
  'PostgrestError',
  'ProviderError',
  'RangeError',
  'RateLimitError',
  'ReferenceError',
  'SESError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
]);

const appErrorCodes = new Set([
  'ALL_RECIPIENTS_BLOCKED',
  'CREDENTIALS_ERROR',
  'EMAIL_BLACKLISTED',
  'EMAIL_VALIDATION_FAILED',
  'INVALID_EMAIL_ADDRESS',
  'MAIL_PROVIDER_REJECTED',
  'MAIL_READ_TIMEOUT',
  'MAIL_SEND_UNCONFIRMED',
  'NETWORK_ERROR',
  'NOT_INITIALIZED',
  'PROVIDER_ERROR',
  'RATE_LIMIT_EXCEEDED',
  'TIMEOUT',
  'UNKNOWN_ERROR',
]);

interface SafeErrorFields {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

interface SafeErrorOptions {
  /**
   * Adds the error's own message, scrubbed of secret-looking values and cut
   * to 200 characters. Only top-level request catches opt in, so an escaped
   * failure stays diagnosable; stacks and causes are never read.
   */
  message?: boolean;
}

export const SAFE_ERROR_MESSAGE_LIMIT = 200;
// Scrub only a bounded prefix: the logged text is far shorter, and the
// patterns stay linear on hostile input.
const SCRUB_INPUT_LIMIT = 2_000;

const redactions: ReadonlyArray<readonly [RegExp, string]> = [
  // URLs carrying credentials or a query string, which can hold tokens.
  [/\b[a-z][\w+.-]*:\/\/[^\s/@"'<>]*@[^\s"'<>]*/giu, '[redacted-url]'],
  [/\b[a-z][\w+.-]*:\/\/[^\s"'<>?]*\?[^\s"'<>]*/giu, '[redacted-url]'],
  // JSON Web Tokens.
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/gu, '[redacted-jwt]'],
  // Supabase keys such as sb_secret_… and sb_publishable_….
  [/\bsb_[a-z]+_[\w-]+/giu, '[redacted-key]'],
  // Authorization schemes and credential assignments.
  [/\b(bearer|basic)\s+[\w.~+/=-]+/giu, '$1 [redacted]'],
  [
    /\b(password|passwd|secret|token|api[_-]?key|authorization)(\s*[:=]\s*)[^\s,;]+/giu,
    '$1$2[redacted]',
  ],
  // Email addresses.
  [/[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/gu, '[redacted-email]'],
  // Long hex and base64-like runs: keys, hashes and opaque tokens.
  [/\b[a-f\d]{32,}\b/giu, '[redacted-hex]'],
  [/[A-Za-z\d+/_-]{32,}={0,2}/gu, '[redacted-token]'],
];

/** One line of at most 200 characters with secret-looking values removed. */
export function scrubLogMessage(text: string): string {
  let scrubbed = text
    .slice(0, SCRUB_INPUT_LIMIT)
    .replace(/[\u0000-\u001f\u007f-\u009f]+/gu, ' ');
  for (const [pattern, replacement] of redactions)
    scrubbed = scrubbed.replace(pattern, replacement);
  scrubbed = scrubbed.trim();
  return scrubbed.length > SAFE_ERROR_MESSAGE_LIMIT
    ? `${scrubbed.slice(0, SAFE_ERROR_MESSAGE_LIMIT - 1)}…`
    : scrubbed;
}

// Reads `message` as an own or inherited data value only when it is already a
// string: no toString, valueOf or getter on a hostile object runs.
function readMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    // Bounded so a proxy whose prototype is itself cannot loop.
    let target: object | null = error;
    for (let depth = 0; target !== null && depth < 8; depth += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(target, 'message');
      if (descriptor)
        return typeof descriptor.value === 'string'
          ? descriptor.value
          : undefined;
      target = Object.getPrototypeOf(target);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readField(error: object, field: string): unknown {
  try {
    return Reflect.get(error, field);
  } catch {
    return null;
  }
}

function isErrorCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ((value.length === 5 && /^[0-9A-Z]{5}$/u.test(value)) ||
      (value.length === 8 && /^PGRST[0-9]{3}$/u.test(value)) ||
      (value.length <= 32 && appErrorCodes.has(value)))
  );
}

function safeHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

export function safeErrorFields(
  error: unknown,
  options: SafeErrorOptions = {}
): SafeErrorFields {
  const message = options.message ? readMessage(error) : undefined;
  const scrubbed = message === undefined ? undefined : scrubLogMessage(message);
  if (typeof error !== 'object' || error === null)
    return scrubbed ? { message: scrubbed } : {};

  const name = readField(error, 'name');
  const code = readField(error, 'code');
  const status =
    safeHttpStatus(readField(error, 'status')) ??
    safeHttpStatus(readField(error, 'statusCode'));
  const fields: SafeErrorFields = {};

  if (name !== undefined) {
    fields.name =
      typeof name === 'string' && name.length <= 32 && errorNames.has(name)
        ? name
        : 'other';
  }
  if (code !== undefined) fields.code = isErrorCode(code) ? code : 'other';
  if (status !== undefined) fields.status = status;
  if (scrubbed) fields.message = scrubbed;
  return fields;
}

export function safeLogUuid(value: unknown): string | undefined {
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu;
  return typeof value === 'string' && value.length === 36 && uuid.test(value)
    ? value
    : undefined;
}
