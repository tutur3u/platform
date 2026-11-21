// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { legacyHostRedirectEnabled, legacyHostResponse } from './legacy-host';

const PRODUCTION = { mountHosts: ['tuturuuu.com'] };
const STAGING = { mountHosts: [] };
const LEGACY = 'http://infrastructure.tuturuuu.com';

function redirect(
  url: string,
  init: RequestInit = {},
  mounts: { mountHosts?: string[] } = PRODUCTION
) {
  return legacyHostResponse(new Request(url, init), mounts);
}

function expectMounted(
  response: Response | null,
  location: string,
  status = 301
) {
  expect(response?.status).toBe(status);
  expect(response?.headers.get('location')).toBe(location);
  expect(response?.headers.get('cache-control')).toBe('private, no-store');
  expect(response?.headers.getSetCookie()).toEqual([]);
}

/** The Location stays on the fixed apex origin under the `/admin` prefix. */
function expectInsideMount(response: Response | null) {
  expect(response?.status).toBe(301);
  const target = new URL(response?.headers.get('location') ?? '');
  expect(target.origin).toBe('https://tuturuuu.com');
  expect(target.username + target.password).toBe('');
  expect(
    target.pathname === '/admin' || target.pathname.startsWith('/admin/')
  ).toBe(true);
  expect(response?.headers.get('cache-control')).toBe('private, no-store');
  expect(response?.headers.getSetCookie()).toEqual([]);
}

describe('production legacy host', () => {
  it.each([
    ['/', 'https://tuturuuu.com/admin'],
    ['/login', 'https://tuturuuu.com/admin/login'],
    ['/boards/one', 'https://tuturuuu.com/admin/boards/one'],
    ['/boards/one/', 'https://tuturuuu.com/admin/boards/one/'],
    ['/vi/boards', 'https://tuturuuu.com/admin/vi/boards'],
    ['/administrator', 'https://tuturuuu.com/admin/administrator'],
    // A path already under the mount keeps its prefix (no /admin/admin).
    ['/admin', 'https://tuturuuu.com/admin'],
    ['/admin/boards', 'https://tuturuuu.com/admin/boards'],
    ['/api/build-info/x', 'https://tuturuuu.com/admin/api/build-info/x'],
  ])('moves %s to %s', (path, location) => {
    expectMounted(redirect(`${LEGACY}${path}`), location);
  });

  it.each([
    [
      '?a=1&a=2&b=%20x%2Fy',
      'https://tuturuuu.com/admin/boards?a=1&a=2&b=%20x%2Fy',
    ],
    ['?', 'https://tuturuuu.com/admin/boards?'],
    [
      '?q=caf%C3%A9&empty=&flag',
      'https://tuturuuu.com/admin/boards?q=caf%C3%A9&empty=&flag',
    ],
    [
      '?next=//evil.example',
      'https://tuturuuu.com/admin/boards?next=//evil.example',
    ],
    [
      '?next=https://evil.example/x',
      'https://tuturuuu.com/admin/boards?next=https://evil.example/x',
    ],
  ])('keeps the query %s byte for byte', (query, location) => {
    const response = redirect(`${LEGACY}/boards${query}`);
    expectMounted(response, location);
    expectInsideMount(response);
  });

  it.each([
    ['GET', 301],
    ['HEAD', 301],
    ['POST', 308],
    ['PUT', 308],
    ['PATCH', 308],
    ['DELETE', 308],
    ['OPTIONS', 308],
  ])('answers %s with a permanent %i', (method, status) => {
    expectMounted(
      redirect(`${LEGACY}/api/boards?x=1`, { method }),
      'https://tuturuuu.com/admin/api/boards?x=1',
      status
    );
  });

  it('keeps serving the build identity for every method', () => {
    for (const method of ['GET', 'HEAD', 'POST', 'DELETE'])
      expect(redirect(`${LEGACY}/api/build-info`, { method })).toBeNull();
  });

  it('matches the legacy host case-insensitively and ignores its port', () => {
    expectMounted(
      redirect('http://INFRASTRUCTURE.Tuturuuu.com:8080/boards'),
      'https://tuturuuu.com/admin/boards'
    );
  });

  it('leaves other hosts and the staging profile to the app', () => {
    expect(redirect('http://tuturuuu.com/admin/boards')).toBeNull();
    expect(redirect('http://evil.example/boards')).toBeNull();
    expect(
      redirect('http://infrastructure.tuturuuu.com.evil.example/')
    ).toBeNull();
    expect(redirect(`${LEGACY}/boards`, {}, STAGING)).toBeNull();
    expect(redirect(`${LEGACY}/boards`, {}, {})).toBeNull();
  });
});

describe('production legacy host never redirects off the mount', () => {
  it.each([
    ['//evil.example/x', 'https://tuturuuu.com/admin/evil.example/x'],
    ['///evil.example/x', 'https://tuturuuu.com/admin/evil.example/x'],
    ['/\\evil.example', 'https://tuturuuu.com/admin/evil.example'],
    ['/\\\\evil.example/x', 'https://tuturuuu.com/admin/evil.example/x'],
    ['/%2F%2Fevil.example', 'https://tuturuuu.com/admin/%2F%2Fevil.example'],
    ['/%5Cevil.example', 'https://tuturuuu.com/admin/%5Cevil.example'],
    ['/%5c%5cevil', 'https://tuturuuu.com/admin/%5c%5cevil'],
    [
      '/https://evil.example',
      'https://tuturuuu.com/admin/https://evil.example',
    ],
    ['/@evil.example', 'https://tuturuuu.com/admin/@evil.example'],
    ['/..//evil.example', 'https://tuturuuu.com/admin/evil.example'],
    ['/%2e%2e//evil.example', 'https://tuturuuu.com/admin/evil.example'],
    ['/admin/../..//evil.example', 'https://tuturuuu.com/admin/evil.example'],
    ['/\t/evil.example', 'https://tuturuuu.com/admin/evil.example'],
    ['/\n/evil.example', 'https://tuturuuu.com/admin/evil.example'],
    ['/\r\n//evil.example', 'https://tuturuuu.com/admin/evil.example'],
    [
      '/x\t\r\n?next=//evil.example',
      'https://tuturuuu.com/admin/x?next=//evil.example',
    ],
  ])('keeps %j on the apex mount', (path, location) => {
    const response = redirect(`${LEGACY}${path}`);
    expectInsideMount(response);
    expect(response?.headers.get('location')).toBe(location);
  });

  it('ignores a forwarded host and a spoofed Host header', () => {
    const response = redirect(`${LEGACY}/boards?x=1`, {
      headers: {
        host: 'evil.example',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'http',
        forwarded: 'host=evil.example;proto=http',
      },
    });
    expectMounted(response, 'https://tuturuuu.com/admin/boards?x=1');
  });

  it('serves no redirect for a request whose URL host is not the legacy host', () => {
    expect(
      redirect('http://evil.example/boards', {
        headers: { host: 'infrastructure.tuturuuu.com' },
      })
    ).toBeNull();
  });
});

describe('legacy-host redirect switch', () => {
  it('is on only when the production var is exactly 1', () => {
    expect(
      legacyHostRedirectEnabled({ TUTURUUU_LEGACY_HOST_REDIRECT: '1' })
    ).toBe(true);
    expect(legacyHostRedirectEnabled({})).toBe(false);
    expect(
      legacyHostRedirectEnabled({ TUTURUUU_LEGACY_HOST_REDIRECT: 'true' })
    ).toBe(false);
  });
});
