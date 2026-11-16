// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { legacyHostResponse } from './legacy-host';

const PRODUCTION = { mountHosts: ['tuturuuu.com'] };
const STAGING = { mountHosts: [] };
const LEGACY = 'http://mind.tuturuuu.com';

function redirect(
  url: string,
  init: RequestInit = {},
  mounts: { mountHosts?: string[] } = PRODUCTION
) {
  return legacyHostResponse(new Request(url, init), mounts);
}

function expectMounted(response: Response | null, location: string) {
  expect(response?.status).toBe(307);
  expect(response?.headers.get('location')).toBe(location);
  expect(response?.headers.get('cache-control')).toBe('private, no-store');
  expect(response?.headers.getSetCookie()).toEqual([]);
}

/** The Location stays on the fixed apex origin under the `/mind` prefix. */
function expectInsideMount(response: Response | null) {
  expect(response?.status).toBe(307);
  const target = new URL(response?.headers.get('location') ?? '');
  expect(target.origin).toBe('https://tuturuuu.com');
  expect(target.username + target.password).toBe('');
  expect(
    target.pathname === '/mind' || target.pathname.startsWith('/mind/')
  ).toBe(true);
  expect(response?.headers.get('cache-control')).toBe('private, no-store');
  expect(response?.headers.getSetCookie()).toEqual([]);
}

describe('production legacy host', () => {
  it.each([
    ['/', 'https://tuturuuu.com/mind'],
    ['/login', 'https://tuturuuu.com/mind/login'],
    ['/boards/one', 'https://tuturuuu.com/mind/boards/one'],
    ['/boards/one/', 'https://tuturuuu.com/mind/boards/one/'],
    ['/vi/boards', 'https://tuturuuu.com/mind/vi/boards'],
    ['/mindful', 'https://tuturuuu.com/mind/mindful'],
    // A path already under the mount keeps its prefix (no /mind/mind).
    ['/mind', 'https://tuturuuu.com/mind'],
    ['/mind/boards', 'https://tuturuuu.com/mind/boards'],
    ['/api/build-info/x', 'https://tuturuuu.com/mind/api/build-info/x'],
  ])('moves %s to %s', (path, location) => {
    expectMounted(redirect(`${LEGACY}${path}`), location);
  });

  it.each([
    [
      '?a=1&a=2&b=%20x%2Fy',
      'https://tuturuuu.com/mind/boards?a=1&a=2&b=%20x%2Fy',
    ],
    ['?', 'https://tuturuuu.com/mind/boards?'],
    [
      '?q=caf%C3%A9&empty=&flag',
      'https://tuturuuu.com/mind/boards?q=caf%C3%A9&empty=&flag',
    ],
    [
      '?next=//evil.example',
      'https://tuturuuu.com/mind/boards?next=//evil.example',
    ],
    [
      '?next=https://evil.example/x',
      'https://tuturuuu.com/mind/boards?next=https://evil.example/x',
    ],
  ])('keeps the query %s byte for byte', (query, location) => {
    const response = redirect(`${LEGACY}/boards${query}`);
    expectMounted(response, location);
    expectInsideMount(response);
  });

  it.each(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'answers %s with a 307 that keeps the method',
    (method) => {
      expectMounted(
        redirect(`${LEGACY}/api/boards?x=1`, { method }),
        'https://tuturuuu.com/mind/api/boards?x=1'
      );
    }
  );

  it('keeps serving the build identity to GET and HEAD only', () => {
    expect(redirect(`${LEGACY}/api/build-info`)).toBeNull();
    expect(redirect(`${LEGACY}/api/build-info`, { method: 'HEAD' })).toBeNull();
    expectMounted(
      redirect(`${LEGACY}/api/build-info`, { method: 'POST' }),
      'https://tuturuuu.com/mind/api/build-info'
    );
  });

  it('matches the legacy host case-insensitively and ignores its port', () => {
    expectMounted(
      redirect('http://MIND.Tuturuuu.com:8080/boards'),
      'https://tuturuuu.com/mind/boards'
    );
  });

  it('leaves other hosts and the staging profile to the app', () => {
    expect(redirect('http://tuturuuu.com/mind/boards')).toBeNull();
    expect(redirect('http://evil.example/boards')).toBeNull();
    expect(redirect('http://mind.tuturuuu.com.evil.example/')).toBeNull();
    expect(redirect(`${LEGACY}/boards`, {}, STAGING)).toBeNull();
    expect(redirect(`${LEGACY}/boards`, {}, {})).toBeNull();
  });
});

describe('production legacy host never redirects off the mount', () => {
  it.each([
    ['//evil.example/x', 'https://tuturuuu.com/mind/evil.example/x'],
    ['///evil.example/x', 'https://tuturuuu.com/mind/evil.example/x'],
    ['/\\evil.example', 'https://tuturuuu.com/mind/evil.example'],
    ['/\\\\evil.example/x', 'https://tuturuuu.com/mind/evil.example/x'],
    ['/%2F%2Fevil.example', 'https://tuturuuu.com/mind/%2F%2Fevil.example'],
    ['/%5Cevil.example', 'https://tuturuuu.com/mind/%5Cevil.example'],
    ['/%5c%5cevil', 'https://tuturuuu.com/mind/%5c%5cevil'],
    ['/https://evil.example', 'https://tuturuuu.com/mind/https://evil.example'],
    ['/@evil.example', 'https://tuturuuu.com/mind/@evil.example'],
    ['/..//evil.example', 'https://tuturuuu.com/mind/evil.example'],
    ['/%2e%2e//evil.example', 'https://tuturuuu.com/mind/evil.example'],
    ['/mind/../..//evil.example', 'https://tuturuuu.com/mind/evil.example'],
    ['/\t/evil.example', 'https://tuturuuu.com/mind/evil.example'],
    ['/\n/evil.example', 'https://tuturuuu.com/mind/evil.example'],
    ['/\r\n//evil.example', 'https://tuturuuu.com/mind/evil.example'],
    [
      '/x\t\r\n?next=//evil.example',
      'https://tuturuuu.com/mind/x?next=//evil.example',
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
    expectMounted(response, 'https://tuturuuu.com/mind/boards?x=1');
  });

  it('serves no redirect for a request whose URL host is not the legacy host', () => {
    expect(
      redirect('http://evil.example/boards', {
        headers: { host: 'mind.tuturuuu.com' },
      })
    ).toBeNull();
  });
});
