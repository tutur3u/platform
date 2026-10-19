import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  new URL('../../apps/meet/package.json', import.meta.url)
);
const { unstable_getMiniflareWorkerOptions } = require('wrangler');
const { Miniflare } = require(
  require.resolve('miniflare', {
    paths: [dirname(require.resolve('wrangler'))],
  })
);
const { validateOutput } = createRequire(import.meta.url)(
  './verify-meet-start-output'
);
assert.match(
  process.env.GITHUB_SHA ?? '',
  /^[a-f0-9]{40}$/,
  'exact source SHA is required'
);
const app = fileURLToPath(new URL('../../apps/meet', import.meta.url));
const { configPath, main } = validateOutput(app);
const { workerOptions, externalWorkers } =
  unstable_getMiniflareWorkerOptions(configPath);
const secret = randomUUID() + randomUUID();
const forwarded = [];
const unexpected = [];
let runtime;

function session(target) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'tuturuuu-api',
    iss: 'tuturuuu',
    typ: 'app_coordination',
    sub: 'be0e8f2e-c239-4e40-a1f4-d6881938cae4',
    email: null,
    exp: now + 300,
    iat: now,
    jti: randomUUID(),
    origin_app: 'web',
    target_app: target,
    scopes: ['internal-app:session'],
  })}`;
  return `ttr_app_${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

const signedCookie = () =>
  `tuturuuu_app_session=${session('meet')}; tuturuuu_web_app_session=${session('web')}`;
const fetchWorker = (path, options = {}) =>
  runtime.dispatchFetch(`https://meet.tuturuuu.com${path}`, {
    ...options,
    redirect: 'manual',
  });

before(async () => {
  runtime = new Miniflare({
    host: '127.0.0.1',
    port: 0,
    workers: [
      {
        ...workerOptions,
        name: 'tuturuuu-meet',
        modules: true,
        scriptPath: main,
        modulesRoot: dirname(main),
        bindings: {
          ...workerOptions.bindings,
          MEET_REALTIME_TOKEN_SECRET: secret,
          SUPABASE_SECRET_KEY: secret,
          NEXT_PUBLIC_SUPABASE_URL: 'https://meet-ci.supabase.invalid',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
            'sb_publishable_meet_ci_placeholder',
          GOOGLE_GENERATIVE_AI_API_KEY: 'disposable-unused-fixture',
        },
        outboundService: async (request) => {
          const url = new URL(request.url);
          if (
            url.origin === 'https://tuturuuu.com' &&
            url.pathname === '/api/v1/meet-ci-rewrite'
          ) {
            forwarded.push({
              method: request.method,
              query: url.search,
              cookie: request.headers.get('cookie'),
              body: await request.text(),
            });
            return new Response(
              JSON.stringify({ fixture: 'central-web-api' }),
              {
                status: 207,
                headers: {
                  'content-type': 'application/json',
                  'set-cookie':
                    'meet_ci_upstream=one; Path=/; HttpOnly; Secure; SameSite=Lax',
                },
              }
            );
          }
          unexpected.push(`${request.method} ${url.origin}${url.pathname}`);
          return new Response('Unexpected fixture egress', { status: 599 });
        },
      },
      ...externalWorkers,
      {
        name: 'meet-ci-provider-probe',
        compatibilityDate: '2026-09-06',
        modules: true,
        script:
          'export default { fetch(request, env) { return env.PROVIDER.fetch(request); } };',
        serviceBindings: {
          PROVIDER: { name: 'tuturuuu-meet', entrypoint: 'MeetingAIProvider' },
        },
      },
    ],
  });
  await runtime.ready;
});
after(async () => {
  await runtime?.dispose();
});

test('native Start renders bilingual callback HTML and serves its emitted client module', {
  timeout: 30000,
}, async () => {
  for (const [path, locale] of [
    ['/verify-token', 'en'],
    ['/vi/verify-token', 'vi'],
  ]) {
    const response = await fetchWorker(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.match(
      html,
      /<h1\b[^>]*>[\s\S]*?<svg\b/,
      'callback logo must be server rendered'
    );
    const module = /<script\b[^>]*src="([^"]+)"[^>]*>/g;
    const sources = [...html.matchAll(module)].map((match) => match[1]);
    const asset = sources.find(
      (src) => src.startsWith('/assets/') && /\.js(?:\?|$)/.test(src)
    );
    assert.ok(asset, 'SSR must reference an emitted hydration module');
    const script = await fetchWorker(asset);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /javascript/);
    assert.ok((await script.text()).length > 0);
  }
  assert.deepEqual(unexpected, [], 'SSR must not contact production providers');
});

test('login redirects through canonical SSO and rejects an external next destination', {
  timeout: 30000,
}, async () => {
  for (const path of ['/login', '/vi/login']) {
    const response = await fetchWorker(
      `${path}?next=https%3A%2F%2Funtrusted.invalid%2F`
    );
    assert.ok([302, 303, 307, 308].includes(response.status));
    const login = new URL(response.headers.get('location'));
    assert.equal(login.origin, 'https://tuturuuu.com');
    assert.equal(login.pathname, '/login');
    const callback = new URL(login.searchParams.get('returnUrl'));
    assert.equal(callback.origin, 'https://meet.tuturuuu.com');
    assert.equal(callback.pathname, '/verify-token');
    assert.equal(callback.searchParams.get('nextUrl'), '/');
  }
  assert.deepEqual(unexpected, []);
});

test('unsigned personal meetings preserve the authentication boundary in both locales', {
  timeout: 30000,
}, async () => {
  for (const path of ['/personal/meetings', '/vi/personal/meetings']) {
    const response = await fetchWorker(path);
    assert.equal(response.status, 307, path);
    assert.match(
      new URL(response.headers.get('location'), 'https://meet.tuturuuu.com')
        .pathname,
      /\/login$/
    );
    await response.text();
  }
  assert.deepEqual(unexpected, []);
});

test('emitted public brand asset preserves its exact committed bytes', {
  timeout: 30000,
}, async () => {
  const response = await fetchWorker('/brand-mark-light.svg');
  assert.equal(response.status, 200);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    readFileSync(
      new URL('../../apps/meet/public/brand-mark-light.svg', import.meta.url)
    )
  );
  assert.deepEqual(unexpected, []);
});

test('native local auth handler clears all satellite cookies without reaching the API fallback', {
  timeout: 30000,
}, async () => {
  const response = await fetchWorker('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: signedCookie() },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const cookies = response.headers.getSetCookie();
  for (const name of [
    'tuturuuu_app_session',
    'tuturuuu_web_app_session',
    'tuturuuu_app_session_refresh',
    'tuturuuu_web_app_session_refresh',
  ]) {
    assert.ok(
      cookies.some(
        (value) =>
          value.startsWith(`${name}=`) &&
          /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(value)
      ),
      name
    );
  }
  assert.deepEqual(forwarded, []);
  assert.deepEqual(unexpected, []);
});

test('authenticated unknown API forwards method, query, body and cookies and preserves upstream response', {
  timeout: 30000,
}, async () => {
  const cookie = signedCookie();
  const response = await fetchWorker(
    '/api/v1/meet-ci-rewrite?repeat=one&repeat=two',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'https://meet.tuturuuu.com',
        'Content-Type': 'application/json',
      },
      body: '{"fixture":true}',
    }
  );
  assert.equal(response.status, 207);
  assert.deepEqual(await response.json(), { fixture: 'central-web-api' });
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].method, 'POST');
  assert.equal(forwarded[0].query, '?repeat=one&repeat=two');
  assert.equal(forwarded[0].body, '{"fixture":true}');
  assert.match(forwarded[0].cookie ?? '', /tuturuuu_app_session=ttr_app_/);
  assert.ok(
    response.headers
      .getSetCookie()
      .some((value) => value.startsWith('meet_ci_upstream=one;'))
  );
  assert.deepEqual(unexpected, []);
});

test('anonymous protected API cannot fall through to upstream or SPA HTML', {
  timeout: 30000,
}, async () => {
  const count = forwarded.length;
  const response = await fetchWorker('/api/v1/meet-ci-rewrite');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type') ?? '', /json/);
  await response.text();
  assert.equal(forwarded.length, count);
  assert.deepEqual(unexpected, []);
});

test('emitted Worker serves exact source identity and retains Live admission guards', {
  timeout: 30000,
}, async () => {
  const response = await fetchWorker('/api/build-info');
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.appName, 'meet');
  assert.equal(info.commitHash, process.env.GITHUB_SHA);
  assert.equal(
    info.environment,
    process.env.GITHUB_REF === 'refs/heads/production'
      ? 'production'
      : 'preview'
  );
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const health = await fetchWorker('/.well-known/meeting-runtime');
  assert.deepEqual(await health.json(), { version: 1 });
  for (const [headers, status] of [
    [{}, 403],
    [{ Origin: 'https://untrusted.invalid', Upgrade: 'websocket' }, 403],
    [{ Origin: 'https://meet.tuturuuu.com', Upgrade: 'websocket' }, 400],
    [
      {
        Origin: 'https://meet.tuturuuu.com',
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': 'meet-live, auth.invalid',
      },
      401,
    ],
  ]) {
    const denied = await fetchWorker('/live-connect', { headers });
    assert.equal(denied.status, status);
    await denied.text();
  }
  assert.deepEqual(unexpected, []);
});

test('emitted Live class constructs against disposable SQLite and denies absent sessions', {
  timeout: 30000,
}, async () => {
  const namespace = await runtime.getDurableObjectNamespace(
    'MEET_LIVE',
    'tuturuuu-meet'
  );
  const stub = namespace.get(namespace.idFromName(`ci-${randomUUID()}`));
  const response = await stub.fetch('https://meet.tuturuuu.com/live-connect');
  assert.equal(response.status, 401);
  await response.text();
  assert.deepEqual(unexpected, []);
});

test('emitted private provider entrypoint rejects invalid transport before billable egress', {
  timeout: 30000,
}, async () => {
  const probe = await runtime.getWorker('meet-ci-provider-probe');
  const response = await probe.fetch('https://untrusted.invalid/provider');
  assert.equal(response.status, 403);
  await response.text();
  assert.deepEqual(unexpected, []);
});
