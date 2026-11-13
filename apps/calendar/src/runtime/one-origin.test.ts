import { describe, expect, it } from 'vitest';
import { calendarBase } from './calendar-mount';
import { canonicalCalendarAddress } from './one-origin-address';
import {
  calendarNavigationRedirect,
  decideCalendarOneOrigin,
  prepareCalendarStartRequest,
} from './one-origin';

const env = {
  ASSETS: { fetch: async () => new Response() },
  TTR_ONE_ORIGIN_CALENDAR: 'on',
};
const navigation = (url: string, method = 'GET') =>
  new Request(url, { method, headers: { accept: 'text/html' } });
const apex = 'https://tuturuuu.com';
const root = 'https://calendar.tuturuuu.com';

describe('Calendar one-origin boundary', () => {
  it('resolves only the production root and segment-aware apex mount', () => {
    expect(calendarBase(new URL(`${root}/x`))?.basePath).toBe('');
    expect(calendarBase(new URL(`${apex}/calendar`))?.basePath).toBe(
      '/calendar'
    );
    for (const url of [
      `${apex}/calendarish`,
      `${apex}/api`,
      'https://unknown.test/calendar',
    ])
      expect(calendarBase(new URL(url))).toBeNull();
  });
  it.each([undefined, '', 'off', 'invalid'])(
    'refuses the apex with mode %s',
    (mode) => {
      expect(
        decideCalendarOneOrigin(navigation(`${apex}/calendar`), {
          ...env,
          TTR_ONE_ORIGIN_CALENDAR: mode,
        })?.action
      ).toBe('refuse');
      expect(
        decideCalendarOneOrigin(navigation(`${root}/personal`), {
          ...env,
          TTR_ONE_ORIGIN_CALENDAR: mode,
        })?.action
      ).toBe('serve');
    }
  );
  it('refuses non-HTTPS apex requests even when enabled', () => {
    expect(
      decideCalendarOneOrigin(navigation('http://tuturuuu.com/calendar'), env)
        ?.action
    ).toBe('refuse');
  });
  it('serves shadow without boundary redirects', () => {
    const shadow = { ...env, TTR_ONE_ORIGIN_CALENDAR: 'shadow' };
    const request = navigation(`${apex}/calendar/`);
    expect(decideCalendarOneOrigin(request, shadow)).toMatchObject({
      action: 'serve',
      noindex: true,
    });
    expect(calendarNavigationRedirect(request, shadow)).toBeNull();
    expect(
      decideCalendarOneOrigin(navigation(`${root}/personal`), shadow)?.action
    ).toBe('serve');
  });
  it.each(['GET', 'HEAD'])(
    'redirects %s subdomain navigation with raw encoding and duplicate query keys',
    (method) => {
      const decision = decideCalendarOneOrigin(
        navigation(`${root}/a%2Fb/?x=1&x=2&q=a%2Bb`, method),
        env
      );
      expect(decision?.action).toBe('redirect');
      if (decision?.action !== 'redirect') throw new Error('expected redirect');
      expect(decision.response.status).toBe(307);
      expect(decision.response.headers.get('cache-control')).toBe('no-store');
      expect(decision.response.headers.get('location')).toBe(
        `${apex}/calendar/a%2Fb?x=1&x=2&q=a%2Bb`
      );
    }
  );
  it.each([
    '/api',
    '/api/x/',
    '/assets/x/',
    '/.well-known/x/',
    '/_serverFn/x/',
    '/_fn/x/',
    '/_calendar/functions/x/',
    '/serwist/sw.js',
  ])('never redirects machine path %s', (path) => {
    expect(
      decideCalendarOneOrigin(navigation(`${root}${path}`), env)?.action
    ).toBe('serve');
    expect(
      calendarNavigationRedirect(navigation(`${apex}/calendar${path}`), env)
    ).toBeNull();
  });
  it.each(['GET', 'HEAD'])(
    'canonicalizes %s mounted slash documents in one hop',
    (method) => {
      for (const path of ['/calendar/', '/calendar/x/', '/calendar/a%2Fb/']) {
        const response = calendarNavigationRedirect(
          navigation(`${apex}${path}?x=1&x=2&q=%2F`, method),
          env
        );
        expect(response?.status).toBe(301);
        expect(response?.headers.get('location')).toBe(
          `${apex}${path.slice(0, -1)}?x=1&x=2&q=%2F`
        );
      }
    }
  );
  it('never redirects mutations or non-navigation fetches', () => {
    for (const request of [
      navigation(`${apex}/calendar/x/`, 'POST'),
      new Request(`${apex}/calendar/x/`),
      new Request(`${apex}/calendar/x/`, {
        headers: { accept: 'text/html', 'sec-fetch-mode': 'cors' },
      }),
    ])
      expect(calendarNavigationRedirect(request, env)).toBeNull();
    expect(
      decideCalendarOneOrigin(navigation(`${root}/x/`, 'POST'), env)?.action
    ).toBe('serve');
  });
  it.each(['', '/abc%2Fdef'])(
    'redirects meet-together%s outside the Calendar mount, query intact',
    (suffix) => {
      const response = calendarNavigationRedirect(
        navigation(`${apex}/calendar/meet-together${suffix}?x=1&x=2`),
        env
      );
      expect(response?.headers.get('location')).toBe(
        `${apex}/meet-together${suffix}?x=1&x=2`
      );
      expect(response?.status).toBe(301);
    }
  );
  it('prepares bare mount SSR without changing the browser canonical address', () => {
    const request = navigation(`${apex}/calendar?x=1&x=2`);
    expect(prepareCalendarStartRequest(request, '/calendar').url).toBe(
      `${apex}/calendar/?x=1&x=2`
    );
    expect(request.url).toBe(`${apex}/calendar?x=1&x=2`);
    expect(calendarNavigationRedirect(request, env)).toBeNull();
    expect(
      canonicalCalendarAddress({
        pathname: '/calendar/',
        search: '?x=1&x=2',
        hash: '#a',
      })
    ).toBe('/calendar?x=1&x=2#a');
  });
});
