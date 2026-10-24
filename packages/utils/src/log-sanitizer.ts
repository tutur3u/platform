/**
 * Log-injection protection for server runtime logs.
 *
 * Request-derived values (route params, headers, request bodies, provider
 * payloads) must not be able to start a new log line or smuggle terminal
 * control sequences into log output. Wrap every such value with
 * `sanitizeLogValue` before interpolating or passing it to `console.*`.
 */

const DEFAULT_MAX_LOG_VALUE_LENGTH = 2000;
const TRUNCATION_SUFFIX = '...[truncated]';

function isUnsafeLogCharacter(code: number) {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function stripControlCharacters(value: string) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    if (!isUnsafeLogCharacter(value.charCodeAt(index))) result += value[index];
  }
  return result;
}

// Errors log as `name [code]: message` only: stacks and other provider fields
// can carry request-derived content and internal paths.
function formatErrorLike(value: unknown, requireCode: boolean): string | null {
  if (!value || typeof value !== 'object') return null;
  const { code, message, name } = value as Record<string, unknown>;
  if (typeof message !== 'string') return null;
  const hasCode = typeof code === 'string' || typeof code === 'number';
  if (requireCode && !hasCode && !(value instanceof Error)) return null;
  const label = typeof name === 'string' && name ? name : 'Error';
  return `${label}${hasCode ? ` [${code}]` : ''}: ${message}`;
}

function formatLogValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const error = formatErrorLike(value, true);
  if (error !== null) return error;
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/**
 * Formats a value for a single log line: line breaks and control/bidi
 * characters are removed and the result is length-bounded. Errors and
 * provider error objects (with a `code`) log as `name [code]: message`.
 */
export function sanitizeLogValue(
  value: unknown,
  maxLength = DEFAULT_MAX_LOG_VALUE_LENGTH
): string {
  const singleLine = formatLogValue(value).replace(/[\r\n\u2028\u2029]/g, '');
  const sanitized = stripControlCharacters(singleLine);
  return sanitized.length > maxLength
    ? `${sanitized.slice(0, maxLength)}${TRUNCATION_SUFFIX}`
    : sanitized;
}

/**
 * Formats a caught error for logs as `name [code]: message`, never the raw
 * object or its stack. Any object with a string `message` is treated as an
 * error; other values fall back to `sanitizeLogValue`.
 */
export function sanitizeLogError(error: unknown, maxLength = 500): string {
  return sanitizeLogValue(formatErrorLike(error, false) ?? error, maxLength);
}
