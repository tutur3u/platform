import { describe, expect, it } from 'vitest';
import {
  applyOneOriginNoindex,
  decideOneOriginRequest,
  type OneOriginConfig,
  parseOneOriginMode,
  parseOneOriginRedirectStatus,
  readOneOriginEnv,
} from '../one-origin-routing';

const base: OneOriginConfig = {
  basePath: '/meet',
  sharedOrigin: 'https://tuturuuu.com',
  subdomainOrigin: 'https://meet.tuturuuu.com',
  mode: 'on',
  redirectStatus: 307,
  basePathReady: true,
  machinePathPrefixes: ['/live-connect', '/_meet'],
};
const nav = (url: string, init: RequestInit = {}) =>
  new Request(url, {
    ...init,
    headers: { 'sec-fetch-mode': 'navigate', ...init.headers },
  });

describe('parsers', () => {
  it('fails closed to off and 307', () => {
    expect(parseOneOriginMode(' ON ')).toBe('on');
    expect(parseOneOriginMode('shadow')).toBe('shadow');
    for (const value of [undefined, '', 'yes', '1'])
      expect(parseOneOriginMode(value)).toBe('off');
    expect(parseOneOriginRedirectStatus('301')).toBe(301);
    for (const value of [undefined, '302', '308', 'permanent'])
      expect(parseOneOriginRedirectStatus(value)).toBe(307);
    expect(
      readOneOriginEnv(
        {
          TTR_ONE_ORIGIN_MEET: 'on',
          TTR_ONE_ORIGIN_MEET_REDIRECT_STATUS: '301',
        },
        'meet'
      )
    ).toEqual({ mode: 'on', redirectStatus: 301 });
    expect(readOneOriginEnv({ TTR_ONE_ORIGIN_MEET: 1 }, 'meet').mode).toBe(
      'off'
    );
  });
});

describe('subdomain navigations', () => {
  it('redirects with the raw path and query preserved', () => {
    const decision = decideOneOriginRequest(
      nav('https://meet.tuturuuu.com/vi/r/abc%2Fdef?a=1&a=2&q=x+y&next=%2F'),
      base
    );
    expect(decision.action).toBe('redirect');
    if (decision.action !== 'redirect') return;
    expect(decision.response.status).toBe(307);
    expect(decision.response.headers.get('location')).toBe(
      'https://tuturuuu.com/meet/vi/r/abc%2Fdef?a=1&a=2&q=x+y&next=%2F'
    );
    expect(decision.response.headers.get('cache-control')).toBe('no-store');
  });

  it('maps the subdomain root to the canonical mount with a trailing slash', () => {
    for (const [from, to] of [
      ['https://meet.tuturuuu.com/', 'https://tuturuuu.com/meet/'],
      [
        'https://meet.tuturuuu.com/?utm_source=x',
        'https://tuturuuu.com/meet/?utm_source=x',
      ],
    ]) {
      const root = decideOneOriginRequest(nav(from!), base);
      expect(
        root.action === 'redirect' && root.response.headers.get('location')
      ).toBe(to);
    }
  });

  it('uses 301 without a no-store header once promoted', () => {
    const decision = decideOneOriginRequest(
      nav('https://meet.tuturuuu.com/x'),
      {
        ...base,
        redirectStatus: 301,
      }
    );
    expect(decision.action === 'redirect' && decision.response.status).toBe(
      301
    );
    expect(
      decision.action === 'redirect' &&
        decision.response.headers.get('cache-control')
    ).toBeNull();
  });

  it('redirects crawlers that ask for HTML without Fetch Metadata', () => {
    const decision = decideOneOriginRequest(
      new Request('https://meet.tuturuuu.com/r/abc', {
        headers: { accept: 'text/html,application/xhtml+xml' },
      }),
      base
    );
    expect(decision.action).toBe('redirect');
  });
});

describe('subdomain machine traffic is served, never redirected', () => {
  it.each([
    [
      'POST webhook',
      'https://meet.tuturuuu.com/api/v1/x',
      { method: 'POST', body: '{}' },
    ],
    [
      'OAuth callback navigation',
      'https://meet.tuturuuu.com/api/v1/mail/connected/callback?code=1',
      {},
    ],
    [
      'WebSocket',
      'https://meet.tuturuuu.com/live-connect',
      { headers: { upgrade: 'websocket' } },
    ],
    ['server function', 'https://meet.tuturuuu.com/_meet/functions/x', {}],
    ['bridge server function', 'https://meet.tuturuuu.com/_serverFn/x', {}],
    ['asset', 'https://meet.tuturuuu.com/assets/app.js', {}],
    ['well-known', 'https://meet.tuturuuu.com/.well-known/meeting-runtime', {}],
  ])('%s', (_name, url, init) => {
    const decision = decideOneOriginRequest(
      nav(url, init as RequestInit),
      base
    );
    // The bridge serves the subdomain at its root: requests pass unchanged.
    expect(decision).toMatchObject({ action: 'serve', noindex: false });
    if (decision.action === 'serve')
      expect(decision.request.url).toBe(new Request(url).url);
  });

  it('does not redirect fetches or non-navigation GETs', () => {
    const decision = decideOneOriginRequest(
      new Request('https://meet.tuturuuu.com/r/abc', {
        headers: { 'sec-fetch-mode': 'cors' },
      }),
      base
    );
    expect(decision.action).toBe('serve');
  });
});

describe('modes and readiness', () => {
  it('serves the subdomain unchanged in off and shadow modes', () => {
    for (const mode of ['off', 'shadow'] as const) {
      const decision = decideOneOriginRequest(
        nav('https://meet.tuturuuu.com/r/abc'),
        { ...base, mode }
      );
      expect(decision.action).toBe('serve');
    }
  });

  it('refuses the shared origin when off, not ready, or outside the base', () => {
    for (const config of [
      { ...base, mode: 'off' as const },
      { ...base, basePathReady: false },
    ])
      expect(
        decideOneOriginRequest(nav('https://tuturuuu.com/meet/r/a'), config)
          .action
      ).toBe('refuse');
    expect(
      decideOneOriginRequest(nav('https://tuturuuu.com/meeting'), base).action
    ).toBe('refuse');
  });

  it('serves the shared origin, marking shadow mode noindex', () => {
    const shadow = decideOneOriginRequest(nav('https://tuturuuu.com/meet'), {
      ...base,
      mode: 'shadow',
    });
    expect(shadow).toMatchObject({ action: 'serve', noindex: true });
    const on = decideOneOriginRequest(nav('https://tuturuuu.com/meet/x'), base);
    expect(on).toMatchObject({ action: 'serve', noindex: false });
  });

  it('never redirects before the base-path build is ready', () => {
    const decision = decideOneOriginRequest(
      nav('https://meet.tuturuuu.com/r/abc'),
      { ...base, basePathReady: false }
    );
    expect(decision.action).toBe('serve');
    if (decision.action === 'serve')
      expect(decision.request.url).toBe('https://meet.tuturuuu.com/r/abc');
  });

  it('leaves other hosts untouched', () => {
    const request = nav('https://meet-staging.example.workers.dev/r/abc');
    expect(decideOneOriginRequest(request, base)).toEqual({
      action: 'serve',
      request,
      noindex: false,
    });
  });
});

describe('applyOneOriginNoindex', () => {
  it('adds the header and leaves upgrades alone', () => {
    expect(
      applyOneOriginNoindex(new Response('x')).headers.get('x-robots-tag')
    ).toBe('noindex, nofollow');
    const upgrade = { status: 101 } as Response;
    expect(applyOneOriginNoindex(upgrade)).toBe(upgrade);
  });
});
