import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

// Learn-side checks for the nested LMS mount (tuturuuu.com/lms/learn). The
// LMS entry Worker forwards the original apex request through its LEARN
// binding, so these probes use the URLs a browser sends to the apex. They run
// on the emitted Learn Worker; hosted acceptance with real accounts and the
// bound deployment versions stays a separate gateway step.
const apex = 'tuturuuu.com';
const base = '/lms/learn';
// A registered nested page (`/[wsId]/courses/[courseId]/tests/[testId]`) with
// an encoded identifier and repeated query parameters.
const lesson = '/w/courses/c%2Fd/tests/t';
const query = '?x=1&x=2&q=a%2Fb';
// Per-app session cookies a mounted area never sets or clears: the apex
// session is shared by every LMS area.
const appSessionCookie =
  /^(?:__(?:Secure|Host)-)?tuturuuu_(?:web_)?app_session(?:_refresh)?(?:\.\d+)?=/u;

// A well-formed app session token for Learn with the session scope, signed
// with a key the Worker does not hold, so only signature verification can
// reject it.
function wronglySignedSession() {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'tuturuuu-api',
    email: null,
    exp: now + 3600,
    iat: now,
    iss: 'tuturuuu',
    jti: randomUUID(),
    origin_app: 'web',
    scopes: ['internal-app:session'],
    sub: randomUUID(),
    target_app: 'learn',
    typ: 'app_coordination',
  })}`;
  const signature = createHmac('sha256', randomBytes(32))
    .update(unsigned)
    .digest('base64url');
  return `ttr_app_${unsigned}.${signature}`;
}

function assertNoAppSessionWrite(response, where) {
  assert.deepEqual(
    response.setCookies.filter((value) => appSessionCookie.test(value)),
    [],
    `${where}: a mounted area never writes the per-app session`
  );
}

function assertLoginRedirect(response, next, where) {
  assert.equal(response.status, 307, where);
  assert.match(response.headers['cache-control'] ?? '', /\bno-store\b/u);
  const login = new URL(response.headers.location);
  assert.equal(login.origin, `https://${apex}`, where);
  assert.equal(login.pathname, `${base}/login`, where);
  assert.equal(login.searchParams.get('next'), next, where);
  return login;
}

export async function assertLmsMount(call, egress, source) {
  const get = async (path, init) => {
    const response = await call(path, apex, init);
    assertNoAppSessionWrite(response, path);
    return response;
  };

  const landing = await get(`${base}${query}`);
  assert.equal(landing.status, 200);
  assert.match(landing.headers['x-robots-tag'] ?? '', /noindex/u);
  assert.match(landing.headers['cache-control'] ?? '', /\bno-store\b/u);
  assert.match(
    landing.body,
    /<link[^>]*rel="canonical"[^>]*href="https:\/\/tuturuuu\.com\/lms\/learn"/u
  );

  // The return URL Learn hands to Web login names the nested path.
  const login = assertLoginRedirect(
    await get(`${base}${lesson}${query}`),
    lesson + query,
    'signed-out lesson'
  );
  const forward = await get(`${login.pathname}${login.search}`);
  assert.equal(forward.status, 307);
  const webLogin = new URL(forward.headers.location, login);
  assert.equal(webLogin.origin, `https://${apex}`);
  assert.equal(webLogin.pathname, '/login');
  const callback = new URL(webLogin.searchParams.get('returnUrl'));
  assert.equal(callback.origin, `https://${apex}`);
  assert.equal(callback.pathname, '/verify-token');
  assert.equal(callback.searchParams.get('nextUrl'), base + lesson + query);

  const localized = await get(`${base}/vi${lesson}${query}`);
  assert.equal(localized.status, 307);
  assert.equal(
    localized.headers.location,
    `https://${apex}${base}${lesson}${query}`
  );

  assertLoginRedirect(
    await get(`${base}/dashboard`),
    '/dashboard',
    'dashboard'
  );

  // Wrongly signed access tokens without a refresh token resolve locally:
  // the request is treated as signed out and nothing leaves the Worker.
  const forged = wronglySignedSession();
  for (const cookie of [
    `tuturuuu_app_session=${forged}`,
    `tuturuuu_web_app_session=${forged}`,
  ]) {
    for (const [path, next] of [
      [`${base}${lesson}${query}`, lesson + query],
      [`${base}/dashboard`, '/dashboard'],
    ]) {
      const before = egress.length;
      assertLoginRedirect(
        await get(path, { headers: { cookie } }),
        next,
        `${cookie.split('=')[0]} ${path}`
      );
      assert.equal(egress.length, before, `${path}: forged session egress`);
    }
  }

  for (const path of [
    '/api/auth/verify-app-token',
    '/api/auth/refresh-app-session',
  ]) {
    const response = await get(`${base}${path}`, { method: 'POST' });
    assert.equal(response.status, 409, path);
    assert.equal(JSON.parse(response.body).code, 'APP_SESSION_MOUNTED');
  }

  const build = await get(`${base}/api/build-info`, {
    headers: { cookie: `tuturuuu_app_session=${forged}` },
  });
  assert.equal(build.status, 200);
  assert.match(build.headers['cache-control'] ?? '', /\bno-store\b/u);
  const info = JSON.parse(build.body);
  assert.equal(info.appName, 'learn');
  assert.equal(info.commitHash, source);

  // Only the LMS entry Worker dispatches between areas.
  for (const path of [
    '/lms',
    '/lms/',
    '/lms/teach',
    '/lms/teach/w',
    '/lms/teach/api/build-info',
    '/lms/learning',
    '/lms/learnx/w',
  ]) {
    const before = egress.length;
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.equal(egress.length, before, `${path}: egress`);
  }
}
