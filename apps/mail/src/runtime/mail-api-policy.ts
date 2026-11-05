export const MAIL_FUNCTION_BASE = '/_fn';
export const MAIL_LEGACY_FUNCTION_BASE = '/_mail/functions';
export function nativeMethodStatus(method: string, contentType: string | null) {
  if (method !== 'GET' && method !== 'POST') return 405;
  if (
    method === 'POST' &&
    contentType?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    return 415;
  return 200;
}
