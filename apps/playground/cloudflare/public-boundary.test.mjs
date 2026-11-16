import assert from 'node:assert/strict';
import test from 'node:test';
import { mountRootUrl, publicBoundary } from './public-boundary.mjs';

const env = { PLATFORM_BUILD_COMMIT_HASH: 'a'.repeat(40) };
const request = (path, options) =>
  new Request('https://tuturuuu.com' + path, options);

for (const headers of [
  {},
  { Cookie: 'sb-test=synthetic-session' },
  {
    'x-tuturuuu-app-base': '/playground',
    'x-middleware-rewrite': '/api/ai/object-generation',
    Authorization: 'Bearer synthetic-forgery',
  },
]) {
  for (const path of [
    '/api/ai/object-generation',
    '/api/ai/tool-calling',
    '/api/unknown',
    '/_serverFn/anything',
    '/auth/callback',
    '/tool-calling',
  ]) {
    test(
      'no legacy handler dispatch: ' +
        path +
        ' ' +
        Object.keys(headers).join(','),
      () => {
        const result = publicBoundary(
          request('/playground' + path, { headers }),
          env
        );
        assert.equal(result.status, 404);
        assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
        assert.equal(result.headers.get('Set-Cookie'), null);
      }
    );
  }
}
test('build-info has exactly the two public fields and HEAD has no body', async () => {
  const result = publicBoundary(request('/playground/api/build-info'), env);
  assert.deepEqual(await result.json(), {
    commit: env.PLATFORM_BUILD_COMMIT_HASH,
    platform: 'cloudflare',
  });
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  const head = publicBoundary(
    request('/playground/api/build-info', { method: 'HEAD' }),
    env
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
test('build-info rejects invalid identity and mutation methods', () => {
  assert.equal(
    publicBoundary(request('/playground/api/build-info'), {
      PLATFORM_BUILD_COMMIT_HASH: 'unknown',
    }).status,
    503
  );
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal(
      publicBoundary(request('/playground/api/build-info', { method }), env)
        .status,
      405
    );
  }
});
test('only exact mount, known demo pages and assets reach the bridge', () => {
  for (const path of [
    '/playground',
    '/playground/demo/tasks',
    '/playground/assets/a.js',
  ]) {
    assert.equal(publicBoundary(request(path), env), null);
  }
  for (const path of [
    '/playgroundful',
    '/%70layground',
    '//playground',
    '/playground/demo/unknown',
    '/playground/../admin',
    '/api/playground',
  ]) {
    assert.equal(publicBoundary(request(path), env).status, 404, path);
  }
  assert.equal(
    publicBoundary(request('/playground', { method: 'POST' }), env).status,
    405
  );
  assert.equal(
    publicBoundary(new Request('https://evil.example/playground'), env).status,
    404
  );
});

test('canonical page redirects preserve query bytes and never redirect API paths', () => {
  for (const path of ['/playground/', '/playground/demo/tasks/']) {
    const result = publicBoundary(request(path + '?q=%2F%26&a=1&a=2'), env);
    assert.equal(result.status, 301);
    assert.equal(
      result.headers.get('Location'),
      'https://tuturuuu.com' + path.slice(0, -1) + '?q=%2F%26&a=1&a=2'
    );
  }
  assert.equal(
    publicBoundary(request('/playground/api/build-info/'), env).status,
    404
  );
});

test('the bare apex mount reaches the bridge in its canonical form', () => {
  assert.equal(
    mountRootUrl(request('/playground')),
    'https://tuturuuu.com/playground/'
  );
  assert.equal(
    mountRootUrl(request('/playground?q=%2F%26&a=1&a=2')),
    'https://tuturuuu.com/playground/?q=%2F%26&a=1&a=2'
  );
  assert.equal(
    mountRootUrl(request('/playground', { headers: { Cookie: 'a=b' } })),
    'https://tuturuuu.com/playground/'
  );
});

test('only the bare apex mount root is rewritten for the bridge', () => {
  for (const url of [
    'https://tuturuuu.com/playground/',
    'https://tuturuuu.com/playground/demo/tasks',
    'https://tuturuuu.com/playground/assets/a.js',
    'https://tuturuuu.com/playground/api/build-info',
    'https://tuturuuu.com/playgroundful',
    'https://tuturuuu.com/',
    'https://playground.tuturuuu.com/playground',
    'https://playground.tuturuuu.com/',
    'https://evil.example/playground',
  ])
    assert.equal(mountRootUrl(new Request(url)), null, url);
});

test('the bare mount is served, and its slash form redirects to it', () => {
  for (const suffix of ['', '?x=1'])
    assert.equal(publicBoundary(request('/playground' + suffix), env), null);
  const redirected = publicBoundary(request('/playground/?x=1'), env);
  assert.equal(redirected.status, 301);
  assert.equal(
    redirected.headers.get('Location'),
    'https://tuturuuu.com/playground?x=1'
  );
  assert.equal(redirected.headers.get('Cache-Control'), 'private, no-store');
});
