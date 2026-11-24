// Store API error payloads may contain account data. These helpers keep only
// bounded API codes and JSON pointers, never titles, details or messages.

// Google APIs report { error: { code, status, errors: [{ reason }],
// details: [{ reason }] } }. Keep only the enum-like status and reasons.
function googleApiErrorDiagnostic(error) {
  const safe = (value) =>
    typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value)
      ? value
      : '';
  const reasons = [
    ...(Array.isArray(error.errors) ? error.errors : []),
    ...(Array.isArray(error.details) ? error.details : []),
  ]
    .map((entry) => safe(entry?.reason))
    .filter(Boolean);
  return [safe(error.status), ...new Set(reasons)]
    .filter(Boolean)
    .slice(0, 4)
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
