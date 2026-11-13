import { NextRequest } from 'next/server';
import { expect, it } from 'vitest';
import { GET, POST } from './route';

const origin = 'https://infra.example.test';
const cookies = 'tuturuuu_app_session=fixture; sb-test-auth-token=fixture';
function request(method: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/auth/logout`, {
    method,
    headers: { cookie: cookies, ...headers },
  });
}

it('GET returns 405 with Allow POST without deleting cookies or forwarding', () => {
  const response = GET(request('GET'));
  expect(response.status).toBe(405);
  expect(response.headers.get('allow')).toBe('POST');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
});

it.each([
  undefined,
  'null',
  'garbage',
  'https://evil.test',
  'https://infra.example.test.evil.test',
  'https://infra.example.test/path',
  'https://user@infra.example.test',
])('rejects origin %s before cookie effects', (value) => {
  const response = POST(
    request('POST', {
      ...(value === undefined ? {} : { origin: value }),
      'sec-fetch-site': 'same-origin',
      authorization: 'Bearer invalid',
    })
  );
  expect(response.status).toBe(403);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
});

it.each(['cross-site', 'same-site', 'none', 'unknown'])(
  'rejects fetch intent %s even with matching origin',
  (site) => {
    const response = POST(request('POST', { origin, 'sec-fetch-site': site }));
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  }
);

it.each<Record<string, string>>([{}, { 'sec-fetch-site': 'same-origin' }])(
  'clears actual session cookies and redirects relatively for own-origin POST',
  (intent) => {
    const response = POST(
      request('POST', {
        origin,
        ...intent,
        host: 'evil.test',
        'x-forwarded-host': 'evil.test',
        authorization: 'Bearer invalid',
      })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login');
    for (const name of [
      'tuturuuu_app_session',
      'tuturuuu_web_app_session',
      'tuturuuu_app_session_refresh',
      'tuturuuu_web_app_session_refresh',
      'sb-test-auth-token',
    ]) {
      expect(response.cookies.get(name)?.value).toBe('');
    }
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  }
);

it('preserves the actual JSON logout response and cookie deletion', async () => {
  const response = POST(
    request('POST', { origin, accept: 'application/json' })
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  expect(response.headers.get('location')).toBeNull();
  expect(response.cookies.get('tuturuuu_app_session')?.value).toBe('');
});
