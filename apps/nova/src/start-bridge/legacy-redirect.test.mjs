import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  NOVA_APEX_URL,
  NOVA_LEGACY_REDIRECT_STATUS,
  isNovaApexRoot,
  novaBakedApexUrl,
  novaLegacyRedirect,
} from './legacy-redirect.mjs';

const APEX = NOVA_APEX_URL;

function request(url, method = 'GET', host = null) {
  return new Request(url, {
    method,
    headers: host ? { host } : undefined,
  });
}

test('the apex root is only https://tuturuuu.com/nova', () => {
  assert.equal(isNovaApexRoot(APEX), true);
  assert.equal(isNovaApexRoot(`${APEX}/`), true);
  assert.equal(novaBakedApexUrl(['https://nova.tuturuuu.com', APEX]), APEX);
  for (const rejected of [
    'https://nova.tuturuuu.com',
    'https://nova.ai.vn',
    'https://tuturuuu.com/novax',
    'https://tuturuuu.com/nova/extra',
    'https://tuturuuu.com',
    'http://tuturuuu.com/nova',
    'https://user:password@tuturuuu.com/nova',
    'https://tuturuuu.com/nova?next=/',
    'https://nova-ci.supabase.invalid',
    '',
    null,
  ]) {
    assert.equal(isNovaApexRoot(rejected), false, String(rejected));
  }
});

test('GET and HEAD on the legacy hosts move to the apex and keep the query', () => {
  for (const host of ['nova.tuturuuu.com', 'nova.ai.vn', 'nova.tutur3u.com']) {
    const response = novaLegacyRedirect(
      request(`https://${host}/problems?tag=1&tag=2`),
      APEX
    );
    assert.equal(response?.status, NOVA_LEGACY_REDIRECT_STATUS);
    assert.equal(response?.status, 307);
    assert.equal(
      response?.headers.get('Location'),
      'https://tuturuuu.com/nova/problems?tag=1&tag=2'
    );
  }
  const head = novaLegacyRedirect(
    request('https://nova.ai.vn/login', 'HEAD'),
    APEX
  );
  assert.equal(
    head?.headers.get('Location'),
    'https://tuturuuu.com/nova/login'
  );
});

test('the root loses its trailing slash in the same hop', () => {
  const root = novaLegacyRedirect(request('https://nova.ai.vn/'), APEX);
  assert.equal(root?.headers.get('Location'), APEX);
  const slash = novaLegacyRedirect(request('https://nova.ai.vn/learn/'), APEX);
  assert.equal(
    slash?.headers.get('Location'),
    'https://tuturuuu.com/nova/learn'
  );
});

test('machine paths, assets, and non-GET stay on the legacy host', () => {
  const stayed = [
    request('https://nova.ai.vn/api/build-info'),
    request('https://nova.ai.vn/api/auth/callback'),
    request('https://nova.tuturuuu.com/_serverFn/foo'),
    request('https://nova.ai.vn/.well-known/acme'),
    request('https://nova.ai.vn/robots.txt'),
    request('https://nova.ai.vn/sitemap.xml'),
    request('https://nova.ai.vn/logo.png'),
    request('https://nova.ai.vn/login', 'POST'),
    request('https://tuturuuu.com/nova/login'),
    request('https://nova.ai.vn.attacker.invalid/login'),
    request('https://nova.ai.vn/login', 'GET'),
  ];
  assert.equal(
    novaLegacyRedirect(stayed.at(-1), 'https://nova.tuturuuu.com'),
    null
  );
  for (const candidate of stayed.slice(0, -1))
    assert.equal(novaLegacyRedirect(candidate, APEX), null, candidate.url);
});

test('a Host header selects the legacy redirect and the target stays fixed', () => {
  const response = novaLegacyRedirect(
    request(
      'http://127.0.0.1/verify-token?nextUrl=%2Fhome',
      'GET',
      'nova.ai.vn'
    ),
    APEX
  );
  assert.equal(
    response?.headers.get('Location'),
    'https://tuturuuu.com/nova/verify-token?nextUrl=%2Fhome'
  );
  const mounted = novaLegacyRedirect(
    request('https://tuturuuu.com/nova/login', 'GET', 'nova.ai.vn'),
    APEX
  );
  assert.equal(mounted, null);
});
