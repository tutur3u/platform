// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forwardCalendarAcmeChallenge } from './acme';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('canonical Calendar HTTP-01 origin forwarding', () => {
  it.each(['GET', 'HEAD'])(
    'forwards %s unchanged to the retained origin without following redirects',
    async (method) => {
      const request = new Request(
        'https://calendar.tuturuuu.com/.well-known/acme-challenge/token?probe=1',
        { method }
      );
      const origin = new Response(null, {
        status: 404,
        headers: { 'x-vercel-id': 'fixture-origin' },
      });
      const fetchOrigin = vi.fn().mockResolvedValue(origin);
      vi.stubGlobal('fetch', fetchOrigin);
      expect(await forwardCalendarAcmeChallenge(request)).toBe(origin);
      expect(fetchOrigin).toHaveBeenCalledExactlyOnceWith(request, {
        redirect: 'manual',
      });
    }
  );

  it.each([
    ['POST', 'https://calendar.tuturuuu.com/.well-known/acme-challenge/token'],
    ['GET', 'https://calendar.tuturuuu.com/.well-known/acme-challenge'],
    ['GET', 'https://calendar.tuturuuu.com/.well-known/other/token'],
    [
      'GET',
      'https://calendar.tuturuuu.com:8443/.well-known/acme-challenge/token',
    ],
    [
      'GET',
      'https://calendar-cutover.tuturuuu.com/.well-known/acme-challenge/token',
    ],
    [
      'GET',
      'https://calendar-staging.tuturuuu.com/.well-known/acme-challenge/token',
    ],
    ['GET', 'https://untrusted.example/.well-known/acme-challenge/token'],
  ])('keeps %s %s on the native handler', async (method, url) => {
    const request = new Request(url, { method });
    const fetchOrigin = vi.fn();
    vi.stubGlobal('fetch', fetchOrigin);
    expect(forwardCalendarAcmeChallenge(request)).toBeUndefined();
    expect(fetchOrigin).not.toHaveBeenCalled();
  });
});
