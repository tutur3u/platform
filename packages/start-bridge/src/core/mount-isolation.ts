/**
 * Same-origin isolation for an app mounted on the shared apex
 * (`tuturuuu.com/<app>`), opted in per app with `mounts.isolation`.
 *
 * On the apex a mounted app's requests carry every host-only cookie the
 * central Web app set with `Path=/`. Isolation narrows that to what the app
 * actually needs, and keeps the app from writing anything outside its base:
 *
 * - Request: only the app's own cookies, the read-only logout-fence marker
 *   and the Supabase session reach app code. The Supabase session is reduced
 *   to an access-token-only session (no refresh or provider tokens), so a
 *   mounted app can verify the user but can never rotate, extend or clear the
 *   central session. Every other cookie (per-app and Web app sessions, other
 *   apps' cookies, PKCE verifiers, analytics) is removed.
 * - Response: every `Set-Cookie` for a name the app does not own is dropped
 *   (writes and deletions alike). Owned cookies are rewritten host-only
 *   (`Domain` removed), `Path=<base>` and `Secure`, so they can never shadow
 *   or clobber a central `Path=/` cookie.
 * - Upstreams: a request forwarded to any origin other than the central Web
 *   API carries no cookies and no `Authorization` header.
 *
 * Root-mode (subdomain) requests are never touched.
 */

/** Per-app isolation policy; see the module comment. */
export interface MountIsolationConfig {
  /**
   * Exact cookie names the app owns on its mount (e.g. `NEXT_LOCALE`). They
   * reach app code and are written with `Path=<base>`. `__Host-` names are
   * refused, since that prefix requires `Path=/`.
   */
  ownedCookies: readonly string[];
}

/** Read-only marker set by an app-only logout; it can only deny access. */
export const LOGOUT_FENCE_COOKIE_NAME = '__Host-tuturuuu_app_signed_out';

const SUPABASE_AUTH_COOKIE =
  /^(?<key>(?:__(?:Secure|Host)-)?sb-[A-Za-z0-9-]+-auth-token)(?:\.(?<chunk>\d+))?$/u;
const BASE64_PREFIX = 'base64-';
/** Supabase session fields a mounted app never receives. */
const WITHHELD_SESSION_FIELDS = [
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
] as const;

export function assertMountIsolationConfig(config: MountIsolationConfig) {
  for (const name of config.ownedCookies) {
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(name))
      throw new Error(`Invalid owned cookie name: ${name}`);
    if (name.startsWith('__Host-'))
      throw new Error(`An owned mount cookie cannot be __Host-: ${name}`);
    if (SUPABASE_AUTH_COOKIE.test(name) || name === LOGOUT_FENCE_COOKIE_NAME)
      throw new Error(`A mounted app cannot own a session cookie: ${name}`);
  }
}

function parseCookieHeader(header: string | null) {
  const cookies: Array<{ name: string; value: string }> = [];
  for (const part of (header ?? '').split(';')) {
    const equals = part.indexOf('=');
    if (equals < 0) continue;
    const name = part.slice(0, equals).trim();
    if (name) cookies.push({ name, value: part.slice(equals + 1).trim() });
  }
  return cookies;
}

function base64UrlToUtf8(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function utf8ToBase64Url(value: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(value))
    binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

/**
 * The access-token-only form of one Supabase session cookie value (chunks
 * already joined), or `null` when it is not a well-formed session; a
 * malformed session is withheld, so the app sees no session at all.
 */
export function reduceSupabaseSessionValue(raw: string): string | null {
  try {
    const json = raw.startsWith(BASE64_PREFIX)
      ? base64UrlToUtf8(raw.slice(BASE64_PREFIX.length))
      : decodeURIComponent(raw);
    const session: unknown = JSON.parse(json);
    if (
      !session ||
      typeof session !== 'object' ||
      Array.isArray(session) ||
      typeof (session as { access_token?: unknown }).access_token !==
        'string' ||
      !(session as { access_token: string }).access_token
    )
      return null;
    const reduced: Record<string, unknown> = { ...session };
    for (const field of WITHHELD_SESSION_FIELDS) delete reduced[field];
    // supabase-js only treats a stored value as a session when the key is
    // present; an empty refresh token makes any refresh attempt fail closed.
    reduced.refresh_token = '';
    return `${BASE64_PREFIX}${utf8ToBase64Url(JSON.stringify(reduced))}`;
  } catch {
    return null;
  }
}

/**
 * The `Cookie` header a mounted, isolated app receives, or `null` for none.
 * Chunked Supabase sessions are joined in index order (a gap ends the value,
 * as in `@supabase/ssr`) and re-emitted as one cookie under the storage key.
 */
export function isolateMountedCookieHeader(
  header: string | null,
  config: MountIsolationConfig
): string | null {
  const owned = new Set(config.ownedCookies);
  const kept: string[] = [];
  const sessions = new Map<string, { whole?: string; chunks: string[] }>();
  for (const { name, value } of parseCookieHeader(header)) {
    const session = SUPABASE_AUTH_COOKIE.exec(name);
    if (session?.groups?.key) {
      const entry = sessions.get(session.groups.key) ?? { chunks: [] };
      if (session.groups.chunk === undefined) entry.whole ??= value;
      else entry.chunks[Number(session.groups.chunk)] ??= value;
      sessions.set(session.groups.key, entry);
      continue;
    }
    if (owned.has(name) || name === LOGOUT_FENCE_COOKIE_NAME)
      kept.push(`${name}=${value}`);
  }
  for (const [key, entry] of sessions) {
    let raw = entry.whole;
    if (raw === undefined) {
      const ordered: string[] = [];
      for (let index = 0; entry.chunks[index] !== undefined; index++)
        ordered.push(entry.chunks[index] as string);
      raw = ordered.length ? ordered.join('') : undefined;
    }
    const reduced = raw === undefined ? null : reduceSupabaseSessionValue(raw);
    if (reduced) kept.push(`${key}=${reduced}`);
  }
  return kept.length ? kept.join('; ') : null;
}

/** A copy of `request` whose `Cookie` header is isolated for the mount. */
export function isolateMountedRequest(
  request: Request,
  config: MountIsolationConfig
): Request {
  const headers = new Headers(request.headers);
  const cookie = isolateMountedCookieHeader(headers.get('cookie'), config);
  if (cookie === null) headers.delete('cookie');
  else headers.set('cookie', cookie);
  return new Request(request, { headers });
}

/** A copy of `request` with no ambient credentials, for unowned upstreams. */
export function withoutCredentials(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('authorization');
  return new Request(request, { headers });
}

function cookieName(setCookie: string) {
  const equals = setCookie.indexOf('=');
  return (equals < 0 ? setCookie : setCookie.slice(0, equals)).trim();
}

/** One owned `Set-Cookie`, host-only and scoped to the mount base. */
export function scopeOwnedSetCookie(setCookie: string, basePath: string) {
  const [pair = '', ...attributes] = setCookie.split(';');
  const kept = attributes
    .map((attribute) => attribute.trim())
    .filter((attribute) => {
      const key = attribute.split('=')[0]?.trim().toLowerCase();
      return key && key !== 'domain' && key !== 'path' && key !== 'secure';
    });
  return [pair.trim(), ...kept, `Path=${basePath}`, 'Secure'].join('; ');
}

/**
 * Drops every `Set-Cookie` the app does not own and scopes the ones it does
 * to `basePath`. Returns the same response when nothing changes; a WebSocket
 * upgrade (101) cannot be re-wrapped and carries no cookies from app code.
 */
export function scopeMountedResponseCookies(
  response: Response,
  basePath: string,
  config: MountIsolationConfig
): Response {
  const setCookies = response.headers.getSetCookie();
  if (!setCookies.length || response.status === 101) return response;
  const owned = new Set(config.ownedCookies);
  const scoped = setCookies
    .filter((value) => owned.has(cookieName(value)))
    .map((value) => scopeOwnedSetCookie(value, basePath));
  const result = new Response(response.body, response);
  result.headers.delete('set-cookie');
  for (const value of scoped) result.headers.append('set-cookie', value);
  return result;
}
