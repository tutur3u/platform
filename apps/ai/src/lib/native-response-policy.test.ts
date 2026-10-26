import { describe, expect, it } from 'vitest';
import config from '../../start-bridge.config';

function decorate(path: string, headers: HeadersInit = {}, method = 'GET') {
  const wrapResponse = config.wrapResponse;
  if (!wrapResponse) throw new Error('Native response policy is required');
  return wrapResponse(new Response('body', { headers }), {
    request: new Request(`https://ai.tuturuuu.com${path}`, { method }),
    env: {},
  });
}

describe('native root response policy', () => {
  it('rejects apex mounts and unknown hosts in the bridge configuration', () => {
    expect(config.mounts).toEqual({
      rootHosts: ['ai.tuturuuu.com', 'ai-staging.tuturuuu.com'],
      mountHosts: [],
      unknownHost: 'reject',
    });
  });
  it.each(['/', '/vi', '/api/private', '/api/file.json', '/_fn/query'])(
    'protects %s',
    async (path) => {
      const result = await decorate(path);
      expect(result.headers.get('Content-Security-Policy')).toBe(
        "frame-ancestors 'none'"
      );
      expect(result.headers.get('X-Frame-Options')).toBe('DENY');
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(result.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin'
      );
      expect(result.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(result.headers.get('Cache-Control')).toBe('private, no-store');
      expect(result.headers.get('Vary')).toBe('Cookie');
      expect(await result.text()).toBe('body');
    }
  );
  it('retains other CSP directives while denying framing', async () => {
    const result = await decorate('/', {
      'Content-Security-Policy': "default-src 'self'; frame-ancestors *",
    });
    expect(result.headers.get('Content-Security-Policy')).toBe(
      "default-src 'self'; frame-ancestors 'none'"
    );
  });
  it('overrides upstream public caching and merges existing variation', async () => {
    const result = await decorate('/api/public', {
      'Cache-Control': 'public, max-age=60',
      Vary: 'Accept-Encoding',
    });
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result.headers.get('Vary')).toBe('Accept-Encoding, Cookie');
  });
  it('does not duplicate Cookie variation', async () => {
    expect(
      (await decorate('/', { Vary: 'Accept, cookie' })).headers.get('Vary')
    ).toBe('Accept, cookie');
  });
  it.each([
    ['GET', '/assets/client.js'],
    ['HEAD', '/assets/client.js'],
    ['GET', '/robots.txt'],
    ['HEAD', '/robots.txt'],
  ])('preserves static caching for %s %s', async (method, path) => {
    const result = await decorate(
      path,
      {
        'Cache-Control': 'public, max-age=3600',
      },
      method
    );
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(result.headers.get('Vary')).toBeNull();
  });
});

it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
  'forces private caching on %s asset paths',
  async (method) => {
    for (const path of ['/assets/client.js', '/robots.txt']) {
      const result = await decorate(
        path,
        { 'Cache-Control': 'public, max-age=3600' },
        method
      );
      expect(result.headers.get('Cache-Control')).toBe('private, no-store');
      expect(result.headers.get('Vary')).toBe('Cookie');
    }
  }
);
