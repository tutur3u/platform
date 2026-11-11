import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import {
  handleCalendarSafetyNet,
  isCalendarMeetTogetherPath,
  proxyCalendarBareQueryRequest,
} from './calendar-apex-gateway';

const prod = { NODE_ENV: 'production' };
const safetyNetOn = { ...prod, CALENDAR_APEX_SAFETY_NET: '1' };
const proxyOn = { ...prod, CALENDAR_APEX_FALLBACK_PROXY: 'true' };
const req = (
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) => new NextRequest(url, init);

describe('calendar safety net (/calendar/:path* to the subdomain)', () => {
  it('is inert unless the flag is on', () => {
    for (const env of [prod, { ...prod, CALENDAR_APEX_SAFETY_NET: '0' }, {}]) {
      expect(
        handleCalendarSafetyNet(req('https://tuturuuu.com/calendar/ws/x'), env)
      ).toBeNull();
    }
  });

  it('307s to the subdomain with the path inside the app and the query, never cached', () => {
    const response = handleCalendarSafetyNet(
      req('https://tuturuuu.com/calendar/personal/week?eventId=1&x=%20y'),
      safetyNetOn
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/personal/week?eventId=1&x=%20y'
    );
    expect(response?.headers.get('cache-control')).toBe('no-store');
  });

  it('sends the bare path to the subdomain root', () => {
    for (const url of [
      'https://tuturuuu.com/calendar',
      'https://tuturuuu.com/calendar/',
    ]) {
      expect(
        handleCalendarSafetyNet(req(url), safetyNetOn)?.headers.get('location')
      ).toBe('https://calendar.tuturuuu.com/');
    }
    expect(
      handleCalendarSafetyNet(
        req('https://tuturuuu.com/calendar?a=1'),
        safetyNetOn
      )?.headers.get('location')
    ).toBe('https://calendar.tuturuuu.com/?a=1');
  });

  it('is not an open redirect for protocol-relative or backslash paths', () => {
    for (const path of [
      '/calendar//evil.com/x',
      '/calendar/%5Cevil.com',
      '/calendar/\\evil.com',
    ]) {
      const location = handleCalendarSafetyNet(
        req(`https://tuturuuu.com${path}`),
        safetyNetOn
      )?.headers.get('location');
      expect(new URL(location ?? '').origin, path).toBe(
        'https://calendar.tuturuuu.com'
      );
    }
  });

  it('leaves meet-together, near misses and other paths to Web', () => {
    for (const path of [
      '/calendar/meet-together',
      '/calendar/meet-together/plan-id',
      '/calendar-team',
      '/calendars/x',
      '/meet-together',
      '/en/calendar/meet-together',
      '/products/calendar',
      '/',
    ]) {
      expect(
        handleCalendarSafetyNet(
          req(`https://tuturuuu.com${path}`),
          safetyNetOn
        ),
        path
      ).toBeNull();
    }
    expect(isCalendarMeetTogetherPath('/calendar/meet-together/x')).toBe(true);
    expect(isCalendarMeetTogetherPath('/calendar/meet-together-x')).toBe(false);
  });
});

describe('calendar bare /calendar?query fallback proxy', () => {
  const okFetch = () =>
    vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('calendar', {
          headers: { 'content-type': 'text/html', 'set-cookie': 'a=b' },
          status: 200,
        })
    );

  it('is inert unless the flag is on', async () => {
    const fetchImpl = okFetch();
    for (const env of [prod, { ...prod, CALENDAR_APEX_FALLBACK_PROXY: 'no' }]) {
      expect(
        await proxyCalendarBareQueryRequest(
          req('https://tuturuuu.com/calendar?eventId=1'),
          env,
          fetchImpl
        )
      ).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('proxies the bare path with its query to the calendar upstream, preserving the query', async () => {
    const fetchImpl = okFetch();
    const response = await proxyCalendarBareQueryRequest(
      req('https://tuturuuu.com/calendar?eventId=a%20b&view=week', {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sb=1',
          'x-forwarded-for': '1.1.1.1',
        },
      }),
      proxyOn,
      fetchImpl
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe('calendar');
    const call = fetchImpl.mock.calls[0];
    expect(String(call?.[0])).toBe(
      'https://calendar.tuturuuu.com/calendar?eventId=a%20b&view=week'
    );
    const init = call?.[1];
    expect(init?.redirect).toBe('manual');
    const headers = init?.headers as Headers;
    expect(headers.get('cookie')).toBe('sb=1');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(response?.headers.get('set-cookie')).toBeNull();
    expect(response?.headers.get('cache-control')).toBe('private, no-store');
  });

  it('passes upstream redirects through without following them', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          headers: { location: 'https://tuturuuu.com/login' },
          status: 302,
        })
    );
    const response = await proxyCalendarBareQueryRequest(
      req('https://tuturuuu.com/calendar?x=1'),
      proxyOn,
      fetchImpl
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/login'
    );
  });

  it('does not touch a bare path without a query, children or other paths', async () => {
    const fetchImpl = okFetch();
    for (const url of [
      'https://tuturuuu.com/calendar',
      'https://tuturuuu.com/calendar/',
      'https://tuturuuu.com/calendar/ws?x=1',
      'https://tuturuuu.com/calendar/meet-together?x=1',
      'https://tuturuuu.com/calendar-team?x=1',
      'https://tuturuuu.com/en/calendar?x=1',
    ]) {
      expect(
        await proxyCalendarBareQueryRequest(req(url), proxyOn, fetchImpl),
        url
      ).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is GET and HEAD only', async () => {
    const fetchImpl = okFetch();
    const post = await proxyCalendarBareQueryRequest(
      req('https://tuturuuu.com/calendar?x=1', { method: 'POST' }),
      proxyOn,
      fetchImpl
    );
    expect(post?.status).toBe(405);
    expect(post?.headers.get('allow')).toBe('GET, HEAD');
    expect(fetchImpl).not.toHaveBeenCalled();

    const head = await proxyCalendarBareQueryRequest(
      req('https://tuturuuu.com/calendar?x=1', { method: 'HEAD' }),
      proxyOn,
      fetchImpl
    );
    expect(head?.status).toBe(200);
    expect(await head?.text()).toBe('');
  });

  it('fails closed with 502 on an upstream error or a self-pointing upstream', async () => {
    const failing = vi.fn(async () => {
      throw new Error('down');
    });
    expect(
      (
        await proxyCalendarBareQueryRequest(
          req('https://tuturuuu.com/calendar?x=1'),
          proxyOn,
          failing
        )
      )?.status
    ).toBe(502);

    const fetchImpl = okFetch();
    const loop = await proxyCalendarBareQueryRequest(
      req('https://tuturuuu.com/calendar?x=1'),
      {
        ...proxyOn,
        CALENDAR_APEX_UPSTREAM_URL: 'https://tuturuuu.com/calendar',
      },
      fetchImpl
    );
    expect(loop?.status).toBe(502);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
