const REDACTED = '[redacted]';

function redactGoogleText(value) {
  return value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"']+/giu, REDACTED)
    .replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/gu, REDACTED)
    .replace(/\b(?:[a-z][a-z0-9_]*\.)+[a-z][a-z0-9_-]*\b/giu, REDACTED)
    .replace(
      /\b(?:bearer\s+|(?:token|secret|password|api[_ -]?key|project(?: number)?)\s*[:=]\s*)[^\s,;]+/giu,
      REDACTED
    )
    .replace(/\b\d{6,}\b|\b[0-9a-f]{16,}\b|[\w+/-]{24,}={0,2}/giu, (token) =>
      // Preserve long camelCase review parameters while masking opaque IDs.
      /^(?:changesNotSentForReview|changesInReviewBehavior)$/u.test(token)
        ? token
        : REDACTED
    );
}

function googleApiErrorDiagnostic(error) {
  const safe = (value, pattern) =>
    typeof value === 'string' &&
    pattern.test(value) &&
    value.length <= 100 &&
    value.split('.').every((segment) => redactGoogleText(segment) === segment)
      ? value
      : '';
  const details = Array.isArray(error.details) ? error.details.slice(0, 8) : [];
  const errors = Array.isArray(error.errors) ? error.errors.slice(0, 8) : [];
  const reasons = [...errors, ...details].map((entry) =>
    safe(entry?.reason, /^[A-Za-z][A-Za-z0-9_-]{0,79}$/u)
  );
  const fields = details.flatMap((entry) =>
    Array.isArray(entry?.violations)
      ? entry.violations
          .slice(0, 8)
          .map((violation) =>
            safe(
              violation?.field,
              /^(?:releases|track|changesNotSentForReview|changesInReviewBehavior)(?:\[\d{1,4}\]|\.[A-Za-z][A-Za-z0-9_]*){0,8}$/u
            )
          )
      : []
  );
  const message =
    typeof error.message === 'string' && error.message.length <= 8192
      ? redactGoogleText(error.message).trim()
      : '';
  return [
    safe(error.status, /^[A-Z][A-Z_]{0,39}$/u),
    Number.isInteger(error.code) && error.code >= 400 && error.code <= 599
      ? String(error.code)
      : '',
    ...[...new Set(reasons.filter(Boolean))].slice(0, 3),
    ...[...new Set(fields.filter(Boolean))].slice(0, 3),
    /\p{L}/u.test(message.replaceAll(REDACTED, ''))
      ? message.slice(0, 200)
      : '',
  ]
    .filter(Boolean)
    .join(', ');
}

export function storeApiErrorDiagnostic(payload) {
  if (payload?.error && typeof payload.error === 'object')
    return googleApiErrorDiagnostic(payload.error);
  if (!Array.isArray(payload?.errors)) return '';
  return payload.errors
    .slice(0, 3)
    .map((error) => {
      const code = error?.code;
      const pointer = error?.source?.pointer;
      const safeCode =
        typeof code === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(code)
          ? code
          : '';
      const safePointer =
        typeof pointer === 'string' &&
        /^\/(?:data|attributes|relationships)(?:\/[A-Za-z0-9_~.-]+){0,8}$/.test(
          pointer
        ) &&
        pointer.length <= 120
          ? pointer
          : '';
      return [safeCode, safePointer].filter(Boolean).join(' at ');
    })
    .filter(Boolean)
    .join(', ');
}
