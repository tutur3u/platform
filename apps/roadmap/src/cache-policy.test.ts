import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  prepareRoadmapRequest,
  roadmapBoundary,
  selectedBasepath,
} from './request-boundary.ts';
import {
  withRoadmapCachePolicy,
  PUBLIC_DOCUMENT_CACHE,
  PRIVATE_RESPONSE_CACHE,
} from './cache-policy.ts';
const document = 'https://tuturuuu.com/roadmap/';
const html = (headers: Record<string, string> = {}, status = 200) =>
  new Response('public', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
const control = (request: Request, response = html()) =>
  withRoadmapCachePolicy(request, response).headers.get('cache-control');

test('exact root and mounted documents share public policy without reading identity', async () => {
  for (const url of [document, 'https://roadmap.tuturuuu.com/']) {
    for (const headers of [
      {},
      { cookie: 'synthetic=one' },
      { cookie: 'synthetic=two', authorization: 'synthetic' },
    ] as HeadersInit[]) {
      const request = new Request(url, { headers });
      const get = request.headers.get.bind(request.headers);
      request.headers.get = (name) => {
        assert.notEqual(name.toLowerCase(), 'cookie');
        assert.notEqual(name.toLowerCase(), 'authorization');
        return get(name);
      };
      const result = withRoadmapCachePolicy(request, html());
      assert.equal(result.headers.get('cache-control'), PUBLIC_DOCUMENT_CACHE);
      assert.equal(result.headers.has('set-cookie'), false);
      assert.equal(await result.text(), 'public');
    }
  }
  assert.equal(
    control(new Request(document, { method: 'HEAD' })),
    PUBLIC_DOCUMENT_CACHE
  );
});

test('auth, variants, unknown hosts and unsuccessful responses remain private', () => {
  for (const url of [
    document + '?q=x',
    document + '?',
    document + 'unknown',
    document + '_serverFn/a',
    document + 'auth',
    'https://other.example/roadmap/',
    'http://tuturuuu.com/roadmap/',
    'https://roadmap.tuturuuu.com/roadmap/',
    'https://tuturuuu.com/',
  ]) {
    assert.equal(control(new Request(url)), PRIVATE_RESPONSE_CACHE, url);
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    assert.equal(
      control(new Request(document, { method })),
      PRIVATE_RESPONSE_CACHE
    );
  }
  const unsafeHeaders: ReadonlyArray<Record<string, string>> = [
    { 'set-cookie': 'synthetic=one' },
    { vary: 'Cookie' },
    { vary: '*' },
    { vary: 'Accept-Language' },
    { 'cache-control': 'private' },
    { 'cache-control': 'no-store' },
  ];
  for (const headers of unsafeHeaders) {
    const result = withRoadmapCachePolicy(new Request(document), html(headers));
    assert.equal(result.headers.get('cache-control'), PRIVATE_RESPONSE_CACHE);
    for (const [key, value] of Object.entries(headers)) {
      if (key !== 'cache-control') assert.equal(result.headers.get(key), value);
    }
  }
  for (const status of [301, 400, 401, 404, 500]) {
    assert.equal(
      control(new Request(document), html({}, status)),
      PRIVATE_RESPONSE_CACHE
    );
  }
  assert.equal(
    control(new Request(document, { headers: { host: 'other.example' } })),
    PRIVATE_RESPONSE_CACHE
  );
  assert.equal(
    control(new Request(document), new Response('{}')),
    PRIVATE_RESPONSE_CACHE
  );
});

test('composition preserves streams, status, MIME bytes and native asset policy', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('chunk'));
      controller.close();
    },
  });
  const response = new Response(stream, {
    status: 404,
    statusText: 'Missing',
    headers: {
      'content-type': 'Text/HTML; charset=UTF-8',
      'x-native': 'preserved',
    },
  });
  const result = withRoadmapCachePolicy(new Request(document), response);
  assert.equal(result.body, response.body);
  assert.equal(result.status, 404);
  assert.equal(result.statusText, 'Missing');
  assert.equal(result.headers.get('content-type'), 'Text/HTML; charset=UTF-8');
  assert.equal(result.headers.get('x-native'), 'preserved');
  assert.equal(await result.text(), 'chunk');
  const asset = new Response('js', {
    headers: {
      'content-type': 'text/javascript',
      'cache-control': 'public,max-age=31536000,immutable',
    },
  });
  assert.equal(
    withRoadmapCachePolicy(
      new Request('https://tuturuuu.com/roadmap/assets/app-12345678.js'),
      asset
    ),
    asset
  );
  assert.equal(
    control(
      new Request(document, { method: 'HEAD' }),
      new Response(null, { headers: { 'content-type': 'text/html' } })
    ),
    PUBLIC_DOCUMENT_CACHE
  );
});

test('failure and restart perform no storage, network, timers or cache writes', () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(
      control(new Request(document), html({}, 500)),
      PRIVATE_RESPONSE_CACHE
    );
    assert.equal(control(new Request(document)), PUBLIC_DOCUMENT_CACHE);
  }
});

test('host-selected SSR mount and physical transport keys remain isolated', () => {
  for (const [url, base, path] of [
    ['https://roadmap.tuturuuu.com/', '/', '/roadmap/'],
    ['https://tuturuuu.com/roadmap/', '/roadmap', '/roadmap/'],
    [
      'https://roadmap.tuturuuu.com/roadmap/assets/app-12345678.js',
      '/',
      '/roadmap/assets/app-12345678.js',
    ],
    [
      'https://roadmap.tuturuuu.com/roadmap/_serverFn/test',
      '/',
      '/roadmap/_serverFn/test',
    ],
  ] as const) {
    const request = new Request(url);
    assert.equal(selectedBasepath(request), base);
    assert.equal(roadmapBoundary(request), undefined);
    const prepared = prepareRoadmapRequest(request, base);
    assert.equal(new URL(prepared.url).pathname, path);
    assert.equal(prepared.headers.get('x-roadmap-router-base'), base);
  }
  const redirect = roadmapBoundary(
    new Request('https://roadmap.tuturuuu.com/roadmap/?q=test')
  );
  assert.equal(redirect?.status, 308);
  assert.equal(redirect?.headers.get('location'), '/?q=test');
  const mounted = roadmapBoundary(new Request('https://tuturuuu.com/other'));
  assert.equal(mounted?.status, 404);
});
