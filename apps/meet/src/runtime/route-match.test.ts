import { describe, expect, it } from 'vitest';
import { matchRoute, routeParam } from './route-match';

describe('Meet stable route matching', () => {
  it('binds tenant and meeting independently without accepting extra segments', () => {
    expect(
      matchRoute(
        '/api/meet-ai/[wsId]/[meetingId]',
        '/api/meet-ai/tenant/meeting'
      )
    ).toEqual({ wsId: 'tenant', meetingId: 'meeting' });
    expect(
      matchRoute(
        '/api/meet-ai/[wsId]/[meetingId]',
        '/api/meet-ai/tenant/meeting/extra'
      )
    ).toBeNull();
    expect(
      matchRoute('/api/meet-ai/[wsId]/[meetingId]', '/api/meet-ai/tenant')
    ).toBeNull();
  });
  it('retains preview ports, encoded segments and empty optional paths', () => {
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
    expect(() => routeParam({ path: [] }, 'path')).toThrow(
      'Missing route parameter'
    );
  });
});
