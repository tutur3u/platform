import { describe, expect, it } from 'vitest';
import { matchRoute, routeParam } from './route-match';

describe('Calendar stable route matching', () => {
  it('binds tenant and meeting independently without accepting extra segments', () => {
    expect(
      matchRoute(
        '/api/calendar/[wsId]/[meetingId]',
        '/api/calendar/tenant/meeting'
      )
    ).toEqual({ wsId: 'tenant', meetingId: 'meeting' });
    expect(
      matchRoute(
        '/api/calendar/[wsId]/[meetingId]',
        '/api/calendar/tenant/meeting/extra'
      )
    ).toBeNull();
    expect(
      matchRoute('/api/calendar/[wsId]/[meetingId]', '/api/calendar/tenant')
    ).toBeNull();
  });
  it('retains preview ports, encoded segments and empty optional paths', () => {
    const pattern =
      '/api/calendar/[meetingId]/programming/preview/[port]/[[...path]]';
    expect(
      matchRoute(pattern, '/api/calendar/room/programming/preview/3000')
    ).toEqual({ meetingId: 'room', port: '3000', path: [] });
    expect(
      matchRoute(
        pattern,
        '/api/calendar/room/programming/preview/3000/a%20b/index.html'
      )
    ).toEqual({ meetingId: 'room', port: '3000', path: ['a b', 'index.html'] });
    expect(() => routeParam({ path: [] }, 'path')).toThrow(
      'Missing route parameter'
    );
  });
});
