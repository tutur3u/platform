import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInfoResponse } from './build-info.ts';
import {
  normalizeLocalHost,
  prepareRoadmapRequest,
  roadmapBoundary,
  selectedBasepath,
} from './request-boundary.ts';
import {
  withRoadmapCachePolicy,
  PUBLIC_DOCUMENT_CACHE,
  PRIVATE_RESPONSE_CACHE,
  IMMUTABLE_ASSET_CACHE,
  isHashedAssetPath,
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
  ];
  for (const headers of unsafeHeaders) {
    const result = withRoadmapCachePolicy(new Request(document), html(headers));
    assert.equal(result.headers.get('cache-control'), PRIVATE_RESPONSE_CACHE);
    for (const [key, value] of Object.entries(headers)) {
      if (key !== 'cache-control') assert.equal(result.headers.get(key), value);
    }
  }
  for (const cacheControl of ['private', 'no-store', 'no-cache']) {
    assert.equal(
      control(new Request(document), html({ 'cache-control': cacheControl })),
      PUBLIC_DOCUMENT_CACHE,
      cacheControl
    );
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
      'cache-control': IMMUTABLE_ASSET_CACHE,
    },
  });
  assert.equal(
    withRoadmapCachePolicy(
      new Request('https://tuturuuu.com/roadmap/assets/app-12345678.js'),
      asset
    ),
    asset
  );
  const uncached = withRoadmapCachePolicy(
    new Request('https://tuturuuu.com/roadmap/assets/index-CGgt8iCG.js'),
    new Response('js', { headers: { 'content-type': 'text/javascript' } })
  );
  assert.equal(uncached.headers.get('cache-control'), IMMUTABLE_ASSET_CACHE);
  assert.equal(await uncached.text(), 'js');
  const mutable = new Response('js', {
    headers: {
      'content-type': 'text/javascript',
      'cache-control': 'public,max-age=60',
    },
  });
  assert.equal(
    withRoadmapCachePolicy(
      new Request('https://tuturuuu.com/roadmap/assets/app.js'),
      mutable
    ),
    mutable
  );
  assert.equal(isHashedAssetPath('/roadmap/assets/app.js'), false);
  const personalized = withRoadmapCachePolicy(
    new Request('https://tuturuuu.com/roadmap/assets/index-CGgt8iCG.js'),
    new Response('js', {
      headers: {
        'content-type': 'text/javascript',
        'set-cookie': 'synthetic=one',
      },
    })
  );
  assert.equal(
    personalized.headers.get('cache-control'),
    PRIVATE_RESPONSE_CACHE
  );
  assert.equal(personalized.headers.get('set-cookie'), 'synthetic=one');
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

test('host-selected SSR mount and physical transport keys remain isolated', async () => {
  const mountedRequest = new Request('https://tuturuuu.com/roadmap/');
  assert.equal(selectedBasepath(mountedRequest), '/roadmap');
  assert.equal(roadmapBoundary(mountedRequest), undefined);
  const prepared = prepareRoadmapRequest(mountedRequest, '/roadmap');
  assert.equal(new URL(prepared.url).pathname, '/roadmap/');
  assert.equal(prepared.headers.get('x-roadmap-router-base'), '/roadmap');

  for (const [url, location] of [
    ['https://roadmap.tuturuuu.com/', 'https://tuturuuu.com/roadmap/'],
    [
      'https://roadmap.tuturuuu.com/roadmap/assets/app-12345678.js',
      'https://tuturuuu.com/roadmap/assets/app-12345678.js',
    ],
    [
      'https://roadmap.tuturuuu.com/roadmap/_serverFn/test?q=1',
      'https://tuturuuu.com/roadmap/_serverFn/test?q=1',
    ],
    [
      'https://roadmap.tuturuuu.com/roadmap/?q=test',
      'https://tuturuuu.com/roadmap/?q=test',
    ],
    [
      'https://roadmap.tuturuuu.com/notes?x=1',
      'https://tuturuuu.com/roadmap/notes?x=1',
    ],
    [
      'https://roadmap.tuturuuu.com/api/build-info',
      'https://tuturuuu.com/roadmap/api/build-info',
    ],
  ] as const) {
    const request = new Request(url);
    assert.equal(selectedBasepath(request), '/');
    const redirect = roadmapBoundary(request);
    assert.equal(redirect?.status, 301);
    assert.equal(redirect?.headers.get('location'), location);
  }

  const worker = new Request(
    'https://tuturuuu-roadmap.tuturuuu-e89.workers.dev/roadmap/'
  );
  assert.equal(selectedBasepath(worker), '/roadmap');
  assert.equal(roadmapBoundary(worker), undefined);
  const mounted = roadmapBoundary(new Request('https://tuturuuu.com/other'));
  assert.equal(mounted?.status, 404);
  assert.equal(
    roadmapBoundary(new Request('https://tuturuuu.com/roadmap/api/build-info')),
    undefined
  );
  assert.equal(
    roadmapBoundary(new Request('https://tuturuuu.com/api/build-info')),
    undefined
  );
  const info = buildInfoResponse('a'.repeat(40));
  assert.equal(info.status, 200);
  assert.match(info.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(JSON.parse(await info.text()).commit, 'a'.repeat(40));
  assert.equal(buildInfoResponse('development').status, 500);
});

test('loopback Host selects the public host contract', () => {
  const canonical = normalizeLocalHost(
    new Request('http://127.0.0.1:8787/roadmap/', {
      headers: { host: 'tuturuuu.com' },
    })
  );
  assert.equal(canonical.url, 'https://tuturuuu.com/roadmap/');
  assert.equal(canonical.headers.get('host'), 'tuturuuu.com');
  assert.equal(roadmapBoundary(canonical), undefined);

  const satellite = normalizeLocalHost(
    new Request('http://127.0.0.1:8787/notes?x=1', {
      headers: { host: 'roadmap.tuturuuu.com' },
    })
  );
  assert.equal(satellite.url, 'https://roadmap.tuturuuu.com/notes?x=1');
  const redirect = roadmapBoundary(satellite);
  assert.equal(redirect?.status, 301);
  assert.equal(
    redirect?.headers.get('location'),
    'https://tuturuuu.com/roadmap/notes?x=1'
  );

  const foreign = normalizeLocalHost(
    new Request('http://127.0.0.1:8787/roadmap/', {
      headers: { host: 'evil.example' },
    })
  );
  assert.equal(new URL(foreign.url).host, '127.0.0.1:8787');
  const production = normalizeLocalHost(
    new Request('https://roadmap.tuturuuu.com/')
  );
  assert.equal(production.url, 'https://roadmap.tuturuuu.com/');
});
