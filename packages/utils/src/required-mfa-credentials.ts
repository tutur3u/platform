import {
  getSupabaseAuthCookieUrls,
  getSupabaseAuthStorageKey,
} from '@tuturuuu/supabase/next/common';
import type { NextRequest } from 'next/server';

/** Read opaque credentials only. No decoded claim is trusted here; each token
 * is verified by the provider or our app-token verifier before policy lookup. */
export function accountAssuranceCredentials(request: NextRequest): string[] {
  const bearer = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const tokens = new Set<string>();
  if (bearer && /^(?:eyJ|ttr_app_)/.test(bearer)) tokens.add(bearer);
  for (const name of ['tuturuuu_web_app_session', 'tuturuuu_app_session']) {
    const token = request.cookies.get(name)?.value;
    if (token?.startsWith('ttr_app_')) tokens.add(token);
  }
  // Browser auth uses this project key even when the server URL is internal.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [...tokens];
  for (const cookieUrl of getSupabaseAuthCookieUrls(url)) {
    const key = getSupabaseAuthStorageKey(cookieUrl);
    let raw = request.cookies.get(key)?.value;
    if (!raw) {
      const chunks: string[] = [];
      for (let index = 0; request.cookies.has(`${key}.${index}`); index += 1) {
        chunks.push(request.cookies.get(`${key}.${index}`)!.value);
      }
      raw = chunks.join('');
    }
    if (raw) {
      try {
        const decoded = raw.startsWith('base64-')
          ? Buffer.from(raw.slice(7), 'base64url').toString('utf8')
          : raw;
        const session = JSON.parse(decoded) as { access_token?: unknown };
        if (typeof session.access_token === 'string')
          tokens.add(session.access_token);
      } catch {
        // Existing authentication/malformed-cookie guards reject these cookies.
      }
    }
  }
  return [...tokens];
}

/** Provider-first proxies must remove superseded app credentials from the
 * forwarded request, not merely ignore them during policy enforcement. */
export function discardAppCookiesForVerifiedProvider(request: NextRequest) {
  for (const name of [
    'tuturuuu_app_session',
    'tuturuuu_web_app_session',
    'tuturuuu_app_session_refresh',
    'tuturuuu_web_app_session_refresh',
  ])
    request.cookies.delete(name);
}
