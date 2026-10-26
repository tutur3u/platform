// Pure pieces of the signed-in native root-browser gate
// (native-root-browser.mjs): profile validation, fixture sessions, and the
// Worker and browser egress decisions. No I/O, so they are unit-tested
// directly (native-root-browser.test.mjs).
import { createHmac, randomUUID } from 'node:crypto';

export const WEB_ORIGIN = 'https://tuturuuu.com';
export const NO_STORE = 'private, no-store, max-age=0';
const APP_ID = /^[a-z][a-z0-9-]*$/u;
const ROOT_HOST = /^[a-z][a-z0-9-]*\.tuturuuu\.com$/u;
const SESSION_COOKIES = {
  app: 'tuturuuu_app_session',
  web: 'tuturuuu_web_app_session',
};
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * The gate only drives a Worker it started itself on loopback. There is no
 * hosted mode: a hosted origin would need its own reviewed flag.
 */
export function assertLoopbackOrigin(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname))
    throw new Error(`refusing a non-loopback Worker origin: ${url.origin}`);
  return url.origin;
}

/**
 * The fixture browser's service-worker mode. A registered service worker
 * answers requests before Playwright routing sees them, so the gate would
 * measure the worker cache instead of the Worker: routing and acceptance runs
 * block service workers. Only an explicit offline/service-worker run allows
 * them, and must say why: `{ mode: 'allow', reason: '...' }`.
 */
export function serviceWorkerMode(profile) {
  const setting = profile?.serviceWorkers;
  if (setting === undefined || setting === 'block')
    return { mode: 'block', reason: null };
  if (
    typeof setting === 'object' &&
    setting !== null &&
    setting.mode === 'allow' &&
    typeof setting.reason === 'string' &&
    setting.reason.trim()
  )
    return { mode: 'allow', reason: setting.reason.trim() };
  return null;
}

/** Problems with an app's `cloudflare/root-browser.profile.mjs`. */
export function profileProblems(app, profile) {
  const problems = [];
  if (!APP_ID.test(app ?? '')) problems.push('app must be a lowercase app id');
  if (typeof profile !== 'object' || profile === null)
    return [...problems, 'the profile must export a default object'];
  if (!ROOT_HOST.test(profile.rootHost ?? ''))
    problems.push('rootHost must be a canonical <name>.tuturuuu.com host');
  if (!Array.isArray(profile.locales) || profile.locales.length === 0)
    problems.push('locales must list at least one locale');
  for (const [index, entry] of (profile.locales ?? []).entries()) {
    if (!/^[a-z]{2}$/u.test(entry?.locale ?? ''))
      problems.push(`locales[${index}].locale must be a language code`);
    if (typeof entry?.path !== 'string' || !entry.path.startsWith('/'))
      problems.push(`locales[${index}].path must be an app-relative path`);
    if (!(entry?.finalPath instanceof RegExp))
      problems.push(`locales[${index}].finalPath must be a RegExp`);
  }
  for (const kind of profile.session ?? [])
    if (!Object.hasOwn(SESSION_COOKIES, kind))
      problems.push(
        `session entries must be one of: ${Object.keys(SESSION_COOKIES).join(', ')}`
      );
  const hydration = profile.hydration ?? {};
  if (
    typeof hydration.request !== 'function' &&
    typeof hydration.text !== 'function'
  )
    problems.push(
      'hydration needs a request(context) path prefix or a text(context) marker'
    );
  if (!serviceWorkerMode(profile))
    problems.push(
      "serviceWorkers must be 'block' (the default) or { mode: 'allow', reason } for an explicit offline/service-worker run"
    );
  for (const [index, rule] of (profile.browser ?? []).entries()) {
    let origin = null;
    try {
      origin = new URL(rule?.origin).origin;
    } catch {}
    if (origin !== rule?.origin || !origin.startsWith('https://'))
      problems.push(`browser[${index}].origin must be an exact https origin`);
    if (!['image', 401].includes(rule?.fulfill))
      problems.push(`browser[${index}].fulfill must be "image" or 401`);
  }
  return problems;
}

/** A disposable app-coordination token signed with the fixture secret. */
export function signAppSession({
  secret,
  actorId,
  targetApp,
  now = Date.now(),
}) {
  const issued = Math.floor(now / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({
    aud: 'tuturuuu-api',
    iss: 'tuturuuu',
    typ: 'app_coordination',
    sub: actorId,
    email: 'fixture@example.test',
    target_app: targetApp,
    origin_app: 'web',
    scopes: ['internal-app:session'],
    iat: issued,
    exp: issued + 600,
    jti: randomUUID(),
  });
  const signature = createHmac('sha256', secret)
    .update(`${head}.${body}`)
    .digest('base64url');
  return `ttr_app_${head}.${body}.${signature}`;
}

/** The profile's session cookies as `[name, token]` pairs. */
export function sessionCookies(app, profile, { secret, actorId, now }) {
  return (profile.session ?? []).map((kind) => [
    SESSION_COOKIES[kind],
    signAppSession({
      secret,
      actorId,
      targetApp: kind === 'web' ? 'web' : app,
      now,
    }),
  ]);
}

/**
 * Answers the Worker's outbound requests in-process: the fixture user from
 * Supabase auth admin, profile rows by table, empty reads otherwise, the
 * profile's Web responses, and 401 for any other Web API read. Every other
 * request is recorded as unexpected and denied.
 */
export function createWorkerEgress(profile, context) {
  const supabase = new URL(context.supabaseUrl).origin;
  const seen = [];
  const unexpected = [];
  const json = (body, init) => Response.json(body, init);
  function answer(request, url) {
    const read = request.method === 'GET' || request.method === 'HEAD';
    if (url.origin === supabase) {
      if (url.pathname === `/auth/v1/admin/users/${context.actorId}` && read)
        return json({
          id: context.actorId,
          email: 'fixture@example.test',
          user_metadata: {},
          app_metadata: {
            tuturuuu_required_mfa: { required: false, verifiedAfter: 0 },
          },
          banned_until: null,
        });
      if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
      if (url.pathname.startsWith('/rest/v1/') && read) {
        const single = (request.headers.get('accept') ?? '').includes(
          'vnd.pgrst.object'
        );
        const row = profile.supabase?.[url.pathname.slice('/rest/v1/'.length)];
        if (row) {
          const value = row(context);
          return json(single ? value : [value]);
        }
        return single
          ? json(
              {
                code: 'PGRST116',
                details: null,
                hint: null,
                message: 'fixture: no rows',
              },
              { status: 406 }
            )
          : json([], { headers: { 'content-range': '*/0' } });
      }
    }
    if (url.origin === WEB_ORIGIN) {
      const fixture = profile.web?.[`${request.method} ${url.pathname}`];
      if (fixture) return json(fixture(context));
      if (url.pathname.startsWith('/api/') && read)
        return json({ error: 'Unauthorized fixture' }, { status: 401 });
    }
    return null;
  }
  return {
    seen,
    unexpected,
    handle(request) {
      const url = new URL(request.url);
      const label = `${request.method} ${url.origin}${url.pathname}`;
      seen.push(label);
      const response = answer(request, url);
      if (response) return response;
      unexpected.push(`worker ${label}`);
      return new Response('Denied by the root-browser gate', { status: 599 });
    },
  };
}

/**
 * What the browser may load: the Worker origin, Web API reads (401) and
 * media (image), and the profile's allowlist. Anything else is aborted and
 * reported.
 */
export function browserDecision(profile, workerOrigin, method, rawUrl) {
  const url = new URL(rawUrl);
  if (url.origin === workerOrigin) return { action: 'continue' };
  if (url.origin === WEB_ORIGIN && url.pathname.startsWith('/api/'))
    return { action: 'fulfill', fulfill: 401 };
  if (
    url.origin === WEB_ORIGIN &&
    url.pathname.startsWith('/media/') &&
    method === 'GET'
  )
    return { action: 'fulfill', fulfill: 'image' };
  const rule = (profile.browser ?? []).find(
    (entry) =>
      entry.origin === url.origin && (method === 'GET' || entry.fulfill === 401)
  );
  if (rule) return { action: 'fulfill', fulfill: rule.fulfill };
  return {
    action: 'abort',
    label: `browser ${method} ${url.origin}${url.pathname}`,
  };
}

/** Problems with one signed-in SSR response for `locale`. */
export function ssrProblems(response, html, { locale, robots }) {
  const problems = [];
  if (response.status !== 200) problems.push(`status ${response.status}`);
  if (!new RegExp(`<html[^>]*\\slang="${locale}"`, 'u').test(html))
    problems.push(`<html> is not lang="${locale}"`);
  if (!html.includes('/assets/'))
    problems.push('no emitted /assets/ reference');
  if (response.headers.get('cache-control') !== NO_STORE)
    problems.push(`cache-control is ${response.headers.get('cache-control')}`);
  if (robots && response.headers.get('x-robots-tag') !== robots)
    problems.push(`x-robots-tag is ${response.headers.get('x-robots-tag')}`);
  return problems;
}
