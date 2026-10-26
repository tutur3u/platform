import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  assertLoopbackOrigin,
  browserDecision,
  createWorkerEgress,
  NO_STORE,
  profileProblems,
  serviceWorkerMode,
  sessionCookies,
  signAppSession,
  ssrProblems,
} from './native-root-browser-core.mjs';

const profile = {
  rootHost: 'track.tuturuuu.com',
  session: ['app', 'web'],
  locales: [
    { locale: 'en', path: '/', finalPath: /^\/personal$/u },
    {
      locale: 'vi',
      path: '/vi',
      finalPath: /^\/personal$/u,
      cookies: { NEXT_LOCALE: 'vi' },
    },
  ],
  supabase: { workspaces: ({ wsId }) => ({ id: wsId }) },
  web: {
    'GET /api/v1/users/me/default-workspace': ({ wsId }) => ({
      id: wsId,
      personal: true,
    }),
  },
  hydration: { request: ({ wsId }) => `/api/v1/workspaces/${wsId}/` },
  browser: [{ origin: 'https://avatar.vercel.sh', fulfill: 'image' }],
};
const context = {
  actorId: 'actor-1',
  wsId: 'ws-1',
  supabaseUrl: 'https://track-ci.supabase.invalid',
};

test('only loopback Worker origins are driven', () => {
  assert.equal(
    assertLoopbackOrigin('http://127.0.0.1:8787/x'),
    'http://127.0.0.1:8787'
  );
  assert.equal(
    assertLoopbackOrigin('http://localhost:1'),
    'http://localhost:1'
  );
  for (const origin of [
    'https://track.tuturuuu.com',
    'http://track.tuturuuu.com',
    'https://127.0.0.1:8787',
    'http://127.0.0.1.evil.example',
    'http://tuturuuu-track-vite-staging.ops.workers.dev',
  ])
    assert.throws(() => assertLoopbackOrigin(origin), /non-loopback/u);
});

test('profiles are validated before anything starts', () => {
  assert.deepEqual(profileProblems('track', profile), []);
  assert.deepEqual(profileProblems('track', null), [
    'the profile must export a default object',
  ]);
  const problems = profileProblems('Track', {
    rootHost: 'tuturuuu.com',
    locales: [{ locale: 'english', path: 'personal', finalPath: '/personal' }],
    session: ['admin'],
    hydration: {},
    browser: [
      { origin: 'http://avatar.vercel.sh', fulfill: 'image' },
      { origin: 'https://cdn.example/x', fulfill: 200 },
    ],
  });
  assert.deepEqual(problems, [
    'app must be a lowercase app id',
    'rootHost must be a canonical <name>.tuturuuu.com host',
    'locales[0].locale must be a language code',
    'locales[0].path must be an app-relative path',
    'locales[0].finalPath must be a RegExp',
    'session entries must be one of: app, web',
    'hydration needs a request(context) path prefix or a text(context) marker',
    'browser[0].origin must be an exact https origin',
    'browser[1].origin must be an exact https origin',
    'browser[1].fulfill must be "image" or 401',
  ]);
  assert.ok(
    profileProblems('track', { ...profile, locales: [] }).includes(
      'locales must list at least one locale'
    )
  );
});

test('fixture sessions are HMAC-signed app-coordination tokens per target app', () => {
  const token = signAppSession({
    secret: 's',
    actorId: 'a',
    targetApp: 'track',
    now: 1_000_000,
  });
  const [head, body, signature] = token.replace(/^ttr_app_/u, '').split('.');
  assert.equal(
    signature,
    createHmac('sha256', 's').update(`${head}.${body}`).digest('base64url')
  );
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  assert.equal(claims.typ, 'app_coordination');
  assert.equal(claims.sub, 'a');
  assert.equal(claims.target_app, 'track');
  assert.equal(claims.exp - claims.iat, 600);

  const cookies = sessionCookies('track', profile, {
    secret: 's',
    actorId: 'a',
  });
  assert.deepEqual(
    cookies.map(([name, value]) => [
      name,
      JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString())
        .target_app,
    ]),
    [
      ['tuturuuu_app_session', 'track'],
      ['tuturuuu_web_app_session', 'web'],
    ]
  );
});

test('Worker egress is answered in-process and anything else is denied', async () => {
  const egress = createWorkerEgress(profile, context);
  const call = (url, init) => egress.handle(new Request(url, init));

  const user = await call(
    'https://track-ci.supabase.invalid/auth/v1/admin/users/actor-1'
  );
  assert.equal((await user.json()).id, 'actor-1');
  const single = await call(
    'https://track-ci.supabase.invalid/rest/v1/workspaces?select=*',
    {
      headers: { accept: 'application/vnd.pgrst.object+json' },
    }
  );
  assert.deepEqual(await single.json(), { id: 'ws-1' });
  const list = await call(
    'https://track-ci.supabase.invalid/rest/v1/workspaces'
  );
  assert.deepEqual(await list.json(), [{ id: 'ws-1' }]);
  const none = await call(
    'https://track-ci.supabase.invalid/rest/v1/sessions',
    {
      headers: { accept: 'application/vnd.pgrst.object+json' },
    }
  );
  assert.equal(none.status, 406);
  assert.equal((await none.json()).code, 'PGRST116');
  assert.deepEqual(
    await (
      await call('https://track-ci.supabase.invalid/rest/v1/sessions')
    ).json(),
    []
  );
  const rpc = await call('https://track-ci.supabase.invalid/rest/v1/rpc/f', {
    method: 'POST',
  });
  assert.equal(await rpc.json(), null);
  const fixture = await call(
    'https://tuturuuu.com/api/v1/users/me/default-workspace'
  );
  assert.deepEqual(await fixture.json(), { id: 'ws-1', personal: true });
  assert.equal(
    (await call('https://tuturuuu.com/api/v1/notifications')).status,
    401
  );
  assert.deepEqual(egress.unexpected, []);

  for (const url of [
    'https://track-ci.supabase.invalid/rest/v1/sessions',
    'https://tuturuuu.com/api/v1/tasks',
    'https://tuturuuu.com/login',
    'https://api.example/x',
    'https://track-ci.supabase.invalid/storage/v1/object/x',
  ])
    assert.equal(
      (
        await call(
          url,
          url.endsWith('/storage/v1/object/x') ? undefined : { method: 'POST' }
        )
      ).status,
      599
    );
  assert.equal(egress.unexpected.length, 5);
  assert.equal(egress.seen.length, 13);
});

test('the browser loads only the Worker, Web fixtures and the profile allowlist', () => {
  const origin = 'http://127.0.0.1:9000';
  const decide = (method, url) => browserDecision(profile, origin, method, url);
  assert.deepEqual(decide('POST', `${origin}/_serverFn/x`), {
    action: 'continue',
  });
  assert.deepEqual(decide('GET', 'https://tuturuuu.com/api/v1/users/me'), {
    action: 'fulfill',
    fulfill: 401,
  });
  assert.deepEqual(decide('GET', 'https://tuturuuu.com/media/logo.png'), {
    action: 'fulfill',
    fulfill: 'image',
  });
  assert.deepEqual(decide('GET', 'https://avatar.vercel.sh/a.png'), {
    action: 'fulfill',
    fulfill: 'image',
  });
  assert.deepEqual(decide('POST', 'https://avatar.vercel.sh/a.png'), {
    action: 'abort',
    label: 'browser POST https://avatar.vercel.sh/a.png',
  });
  assert.deepEqual(decide('GET', 'https://track.tuturuuu.com/'), {
    action: 'abort',
    label: 'browser GET https://track.tuturuuu.com/',
  });
  assert.deepEqual(decide('GET', 'https://tuturuuu.com/login'), {
    action: 'abort',
    label: 'browser GET https://tuturuuu.com/login',
  });
});

test('signed-in SSR must be a no-store 200 page in the locale with emitted assets', () => {
  const ok = new Response('', {
    headers: { 'cache-control': NO_STORE, 'x-robots-tag': 'noindex' },
  });
  const html = '<html lang="vi" class="x"><script src="/assets/a.js"></script>';
  assert.deepEqual(
    ssrProblems(ok, html, { locale: 'vi', robots: 'noindex' }),
    []
  );
  assert.deepEqual(
    ssrProblems(
      new Response('', {
        status: 404,
        headers: { 'cache-control': 'private, max-age=60' },
      }),
      '<html lang="en">',
      { locale: 'vi', robots: 'noindex' }
    ),
    [
      'status 404',
      '<html> is not lang="vi"',
      'no emitted /assets/ reference',
      'cache-control is private, max-age=60',
      'x-robots-tag is null',
    ]
  );
});

test('service workers are blocked unless a profile explicitly allows them', () => {
  assert.deepEqual(serviceWorkerMode(profile), { mode: 'block', reason: null });
  assert.deepEqual(serviceWorkerMode({ ...profile, serviceWorkers: 'block' }), {
    mode: 'block',
    reason: null,
  });
  const offline = {
    ...profile,
    serviceWorkers: { mode: 'allow', reason: ' offline fallback cache ' },
  };
  assert.deepEqual(serviceWorkerMode(offline), {
    mode: 'allow',
    reason: 'offline fallback cache',
  });
  assert.deepEqual(profileProblems('track', offline), []);

  for (const serviceWorkers of [
    'allow',
    true,
    false,
    { mode: 'allow' },
    { mode: 'allow', reason: '   ' },
    { mode: 'allow', reason: 42 },
    { mode: 'off', reason: 'x' },
    null,
  ]) {
    const silent = { ...profile, serviceWorkers };
    assert.equal(
      serviceWorkerMode(silent),
      null,
      JSON.stringify(serviceWorkers)
    );
    assert.ok(
      profileProblems('track', silent).some((problem) =>
        problem.startsWith('serviceWorkers must be')
      ),
      JSON.stringify(serviceWorkers)
    );
  }
});
