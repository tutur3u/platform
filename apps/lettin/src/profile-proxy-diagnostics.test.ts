import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { test, vi } from 'vitest';
import { routing } from './i18n/routing';
import {
  beginProfileRequest,
  PROFILE_REQUEST_HEADER,
  tagProfileProxyResponse,
} from './profile-proxy-diagnostics';

const env = {
  TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS: '1',
  NODE_ENV: 'development',
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_RUN_ID: '123',
  GITHUB_SHA: 'a'.repeat(40),
};
const path = '/00000000-0000-0000-0000-000000000000/profile';
const request = {
  url: `http://127.0.0.1:7833${path}?token=private`,
  nextUrl: { pathname: `/en${path}` },
};

test('default-off and non-hosted/non-development fixtures cannot emit provenance', () => {
  for (const settings of [
    {},
    { ...env, TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS: undefined },
    { ...env, NODE_ENV: 'production' },
    { ...env, RUNNER_ENVIRONMENT: 'self-hosted' },
    { ...env, GITHUB_SHA: 'unknown' },
    { ...env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { ...env, CLOUDFLARE_API_TOKEN: 'private' },
  ]) {
    const response = new Response(null, {
      status: 307,
      headers: { location: request.url },
    });
    assert.equal(
      tagProfileProxyResponse(request, response, 'canonical-locale', settings),
      response
    );
    assert.equal(response.headers.get('x-lettin-profile-proxy'), null);
    assert.equal(response.headers.get('location'), request.url);
  }
});

test('owned local profile responses preserve status/location and expose only fixed categories', () => {
  const response = new Response(null, {
    status: 307,
    headers: { location: request.url },
  });
  assert.equal(
    tagProfileProxyResponse(request, response, 'canonical-locale', env),
    response
  );
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), request.url);
  assert.equal(
    response.headers.get('x-lettin-profile-proxy'),
    'canonical-locale|unprefixed|en|different'
  );
  assert.doesNotMatch(
    response.headers.get('x-lettin-profile-proxy')!,
    /private|token|00000000/u
  );
});

test('foreign origins, non-profile paths and malformed URLs remain untagged', () => {
  for (const url of [
    `https://lettin.tuturuuu.com${path}`,
    `http://not-localhost:7833${path}`,
    `http://localhost:7834${path}`,
    `https://localhost:7833${path}`,
    'http://127.0.0.1:7833/login',
    'invalid',
  ]) {
    const response = new Response();
    tagProfileProxyResponse({ ...request, url }, response, 'intl', env);
    assert.equal(response.headers.get('x-lettin-profile-proxy'), null);
  }
});

test('real NextRequest normalized loopback remains tagged under the owned fixture gate', () => {
  const normalizedRequest = new NextRequest(`http://127.0.0.1:7833${path}`);
  assert.equal(new URL(normalizedRequest.url).origin, 'http://localhost:7833');
  const response = new Response(null, {
    status: 307,
    headers: { location: normalizedRequest.url },
  });
  tagProfileProxyResponse(normalizedRequest, response, 'canonical-locale', env);
  assert.equal(response.headers.get('location'), normalizedRequest.url);
  assert.equal(
    response.headers.get('x-lettin-profile-proxy'),
    'canonical-locale|unprefixed|unprefixed|same'
  );
  const defaultOffResponse = new Response();
  tagProfileProxyResponse(normalizedRequest, defaultOffResponse, 'intl', {});
  assert.equal(defaultOffResponse.headers.get('x-lettin-profile-proxy'), null);
});

test('real next-intl rewrites an unprefixed profile and redirects only the prefixed form', () => {
  const intl = createIntlMiddleware(routing);
  const unprefixed = intl(new NextRequest(`http://127.0.0.1:7833${path}`));
  assert.equal(unprefixed.status, 200);
  assert.equal(
    new URL(unprefixed.headers.get('x-middleware-rewrite')!).pathname,
    `/en${path}`
  );
  const prefixed = intl(new NextRequest(`http://127.0.0.1:7833/en${path}`));
  assert.equal(prefixed.status, 307);
  assert.equal(new URL(prefixed.headers.get('location')!).pathname, path);
});

function documentRequest(prefix = '/en') {
  return new NextRequest(`http://127.0.0.1:7833${prefix}${path}`, {
    headers: {
      accept: 'text/html',
      'sec-fetch-dest': 'document',
      [PROFILE_REQUEST_HEADER]: 'untrusted-incoming',
      'x-existing': 'retained',
    },
  });
}

test('entry overrides incoming identity and real intl forwards each concurrent document independently', async () => {
  const requests: [NextRequest, NextRequest] = [
    documentRequest(''),
    documentRequest(''),
  ];
  requests[1].headers.set('accept-language', 'vi');
  const ids = await Promise.all(
    requests.map(async (item) => beginProfileRequest(item, env))
  );
  assert.ok(
    ids.every((id) => typeof id === 'string' && /^[a-f0-9]{32}$/u.test(id))
  );
  assert.notEqual(ids[0], ids[1]);
  const intl = createIntlMiddleware(routing);
  requests.forEach((item, index) => {
    const response = intl(item);
    const before = new Headers(response.headers);
    tagProfileProxyResponse(item, response, 'intl', env);
    assert.equal(response.headers.get(PROFILE_REQUEST_HEADER), ids[index]);
    assert.equal(
      response.headers.get(`x-middleware-request-${PROFILE_REQUEST_HEADER}`),
      ids[index]
    );
    assert.equal(
      response.headers.get('x-middleware-request-x-existing'),
      'retained'
    );
    for (const [key, value] of before)
      assert.equal(response.headers.get(key), value);
  });
});

test('all tagged response branches retain status, headers, body and cookies', () => {
  const item = documentRequest();
  const id = beginProfileRequest(item, env);
  for (const stage of [
    'canonical-locale',
    'canonical-public',
    'verify-token',
    'login',
    'auth-login',
    'workspace-route-status',
    'intl',
  ] as const) {
    const response = NextResponse.redirect(new URL('/login', item.url));
    response.cookies.set('existing-cookie', 'retained', { httpOnly: true });
    const before = new Headers(response.headers);
    assert.equal(tagProfileProxyResponse(item, response, stage, env), response);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get(PROFILE_REQUEST_HEADER), id);
    for (const [key, value] of before)
      assert.equal(response.headers.get(key), value);
  }
});

test('disabled, non-HTML and non-GET requests remove untrusted IDs and create none', () => {
  for (const settings of [{}, env]) {
    const item = documentRequest();
    if (settings === env) item.headers.set('accept', 'application/json');
    assert.equal(beginProfileRequest(item, settings), undefined);
    assert.equal(item.headers.get(PROFILE_REQUEST_HEADER), null);
    const response = tagProfileProxyResponse(
      item,
      NextResponse.next(),
      'intl',
      settings
    );
    assert.equal(response.headers.get(PROFILE_REQUEST_HEADER), null);
  }
  const item = new NextRequest(`http://127.0.0.1:7833/en${path}`, {
    method: 'POST',
    headers: { accept: 'text/html', 'sec-fetch-dest': 'document' },
  });
  assert.equal(beginProfileRequest(item, env), undefined);
});

test('entry and response diagnostic failures preserve the request and original response', () => {
  const item = documentRequest('');
  const logger = vi.spyOn(console, 'info').mockImplementation(() => {
    throw new Error('diagnostic log');
  });
  try {
    const id = beginProfileRequest(item, env);
    assert.ok(id);
    assert.equal(item.headers.get(PROFILE_REQUEST_HEADER), id);
    const response = NextResponse.next();
    const setter = vi.spyOn(response.headers, 'set').mockImplementation(() => {
      throw new Error('diagnostic header');
    });
    try {
      assert.equal(
        tagProfileProxyResponse(item, response, 'intl', env),
        response
      );
    } finally {
      setter.mockRestore();
    }
  } finally {
    logger.mockRestore();
  }
});
