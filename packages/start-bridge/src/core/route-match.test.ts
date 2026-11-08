import { describe, expect, it } from 'vitest';
import {
  compareRoutePatterns,
  fromNextSourcePattern,
  matchRoute,
  routeParam,
  routeSegments,
} from './route-match';

describe('route matching', () => {
  it('binds dynamic segments without accepting extra or missing segments', () => {
    const pattern = '/api/meet-ai/[wsId]/[meetingId]';
    expect(matchRoute(pattern, '/api/meet-ai/tenant/meeting')).toEqual({
      wsId: 'tenant',
      meetingId: 'meeting',
    });
    expect(matchRoute(pattern, '/api/meet-ai/tenant/meeting/extra')).toBeNull();
    expect(matchRoute(pattern, '/api/meet-ai/tenant')).toBeNull();
  });

  it('retains encoded segments and empty optional catch-alls', () => {
    const pattern =
      '/api/meet-call/[meetingId]/programming/preview/[port]/[[...path]]';
    expect(
      matchRoute(pattern, '/api/meet-call/room/programming/preview/3000')
    ).toEqual({ meetingId: 'room', port: '3000', path: [] });
    expect(
      matchRoute(
        pattern,
        '/api/meet-call/room/programming/preview/3000/a%20b/index.html'
      )
    ).toEqual({ meetingId: 'room', port: '3000', path: ['a b', 'index.html'] });
  });

  it('requires at least one segment for a required catch-all', () => {
    expect(matchRoute('/docs/[...slug]', '/docs')).toBeNull();
    expect(matchRoute('/docs/[...slug]', '/docs/a/b')).toEqual({
      slug: ['a', 'b'],
    });
    expect(matchRoute('/docs/[[...slug]', '/docs/a')).toBeNull();
    expect(matchRoute('/docs/[...slug]]', '/docs/a')).toBeNull();
  });

  it('rejects static mismatches and throws URIError on malformed encoding', () => {
    expect(matchRoute('/api/meet-call/[id]', '/api/other/room')).toBeNull();
    expect(() =>
      matchRoute('/api/meet-call/[id]', '/api/meet-call/%ZZ')
    ).toThrow(URIError);
  });

  it('reads scalar and segment parameters strictly', () => {
    expect(routeParam({ meetingId: 'room' }, 'meetingId')).toBe('room');
    expect(() => routeParam({}, 'meetingId')).toThrow(
      'Missing route parameter: meetingId'
    );
    expect(() => routeParam({ path: [] }, 'path')).toThrow(
      'Missing route parameter'
    );
    expect(routeSegments({ path: [] }, 'path')).toEqual([]);
    expect(() => routeSegments({ path: 'tenant' }, 'path')).toThrow(
      'Missing route segments: path'
    );
  });

  it('orders static before dynamic before catch-all at the first difference', () => {
    const patterns = [
      '/api/[...rest]',
      '/api/meet-live/[meetingId]',
      '/api/[[...all]]',
      '/api/meet-live/memory',
      '/api/[id]/memory',
    ];
    expect(patterns.toSorted(compareRoutePatterns)).toEqual([
      '/api/meet-live/memory',
      '/api/meet-live/[meetingId]',
      '/api/[id]/memory',
      '/api/[...rest]',
      '/api/[[...all]]',
    ]);
  });

  it('converts Next rewrite sources to bracket patterns', () => {
    expect(fromNextSourcePattern('/api/v1/:wsId/settings/permissions')).toBe(
      '/api/v1/[wsId]/settings/permissions'
    );
    expect(fromNextSourcePattern('/api/:path*')).toBe('/api/[[...path]]');
    expect(fromNextSourcePattern('/api/:path+')).toBe('/api/[...path]');
    expect(fromNextSourcePattern('/api/[wsId]')).toBe('/api/[wsId]');
  });
});
