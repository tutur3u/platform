const DENIED_KEY =
  /(^|[_-])(authorization|cookie|credential|password|passwd|secret|token|api[_-]?key|session)($|[_-])/i;

const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 4096;

function isDeniedKey(key: string) {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return DENIED_KEY.test(normalized);
}

export function sanitizeExternalChatPayload(value: unknown): unknown {
  return sanitizeValue(value, 0);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value))
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, depth + 1));
  if (!value || typeof value !== 'object') return String(value ?? '');

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isDeniedKey(key))
      .slice(0, MAX_OBJECT_KEYS)
      .map(([key, child]) => [key, sanitizeValue(child, depth + 1)])
  );
}

export function sanitizeExternalChatRecord(
  value: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeExternalChatPayload(value) as Record<string, unknown>;
}
