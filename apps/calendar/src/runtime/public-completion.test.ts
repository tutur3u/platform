// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({
  actor: vi.fn(),
  data: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock(
  '@tuturuuu/supabase/next/common',
  () => import('../../../../packages/supabase/src/next/common')
);
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: ports.data,
  hasAuthenticatedBearerToken: ports.data,
  isTrustedProxyBypassRequest: ports.data,
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: ports.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: ports.data,
  createAdminClient: ports.data,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: ports.data,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: ports.data,
  withForwardedInternalApiAuth: ports.data,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: ports.actor,
}));
vi.mock('../app/[locale]/(auth)/login/page', () => ({ default: ports.data }));
vi.mock('./calendar-page-model.server', () => ({
  calendarPageModel: ports.data,
}));
vi.mock('./lab-model.server', () => ({ labModel: ports.data }));
vi.mock('./task-page-model.server', () => ({ taskPageModel: ports.data }));
vi.mock('./workspace-model.server', () => ({
  workspaceModel: ports.data,
  workspaceShellModel: ports.data,
}));

import { proxy } from '../proxy';
import { loadPageModel } from './page-model.server';
import { dispatchThroughCalendarProxy } from './proxy-bridge';
import { withCalendarRequest } from './request-context';
import { resolveCalendarLocale } from './request-locale';
import { applyCalendarResponsePolicy } from './response-policy';

const origin = 'https://calendar.tuturuuu.com';
const cases: [string, 'en' | 'vi', Record<string, string>][] = [
  ['/verify-token', 'en', {}],
  ['/vi/verify-token', 'vi', {}],
  ['/verify-token', 'vi', { cookie: 'NEXT_LOCALE=vi' }],
  ['/verify-token', 'vi', { 'accept-language': 'vi,en;q=0.5' }],
];
let outbound: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  outbound = vi.fn<typeof fetch>(async () => {
    throw new Error('Unexpected external verification');
  });
  vi.stubGlobal('fetch', outbound);
  ports.actor.mockImplementation(() => {
    throw new Error('Public completion must not load an actor');
  });
  ports.data.mockImplementation(() => {
    throw new Error('Public completion must not load data');
  });
  ports.updateSession.mockResolvedValue({
    claims: null,
    res: NextResponse.next(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function dispatch(request: Request) {
  const render = vi.fn(async (forwarded: NextRequest) => {
    const model = await loadPageModel(forwarded.url);
    expect(model.kind).toBe('verify-token');
    expect(resolveCalendarLocale(forwarded)).toBe(model.locale);
    expect(model.actorId).toBeUndefined();
    expect(model.showVersionBadge).toBe(false);
    return new Response(`<html lang="${model.locale}">completion</html>`, {
      headers: { 'content-type': 'text/html' },
    });
  });
  const response = await applyCalendarResponsePolicy(
    request,
    await dispatchThroughCalendarProxy({
      request,
      proxy,
      dispatch: render,
      waitUntil: () => {},
    })
  );
  return { response, render };
}

describe('real production Calendar completion proxy and locale contract', () => {
  for (const method of ['GET', 'HEAD']) {
    it.each(cases)(
      `${method} %s reaches the anonymous completion model without a redirect`,
      async (path, locale, headers) => {
        const request = new Request(`${origin}${path}`, { method, headers });
        const { response, render } = await dispatch(request);
        expect(response.status).toBe(200);
        expect(response.headers.has('location')).toBe(false);
        expect(render).toHaveBeenCalledTimes(1);

        expect(response.headers.get('x-frame-options')).toBe('DENY');
        expect(response.headers.get('content-security-policy')).toContain(
          "frame-ancestors 'none'"
        );
        expect(await response.text()).toContain(`lang="${locale}"`);
        expect(ports.actor).not.toHaveBeenCalled();
        expect(ports.data).not.toHaveBeenCalled();
        expect(outbound).not.toHaveBeenCalled();
      }
    );
  }

  it.each(cases)(
    'loads %s publicly before actor resolution even with credentials present',
    async (path, locale, headers) => {
      const request = new Request(`${origin}${path}`, {
        headers: { ...headers, authorization: 'Bearer untrusted' },
      });
      const model = await withCalendarRequest(
        { request, responseHeaders: new Headers(), waitUntil: () => {} },
        () => loadPageModel(request.url)
      );
      expect(model.kind).toBe('verify-token');
      expect(model.locale).toBe(locale);
      expect(ports.actor).not.toHaveBeenCalled();
      expect(ports.data).not.toHaveBeenCalled();
      expect(outbound).not.toHaveBeenCalled();
    }
  );

  it('cleans stale auth cookies while preserving the locale preference on public completion', async () => {
    const request = new Request(
      `${origin}/verify-token?nextUrl=https://evil.invalid`,
      {
        headers: { cookie: 'sb-old-auth-token=stale; NEXT_LOCALE=vi' },
      }
    );
    const { response, render } = await dispatch(request);
    expect(response.status).toBe(200);
    expect(response.headers.has('location')).toBe(false);
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([expect.stringContaining('sb-old-auth-token=;')])
    );
    expect(await response.text()).toContain('lang="vi"');
    expect(render).toHaveBeenCalledTimes(1);
    expect(outbound).not.toHaveBeenCalled();
    expect(ports.actor).not.toHaveBeenCalled();
  });

  it.each(['/verify-token/extra', '/%76erify-token', '/en/verify-token/'])(
    'does not resolve nonexact %s as an anonymous completion model',
    async (path) => {
      const request = new Request(`${origin}${path}`);
      await expect(
        withCalendarRequest(
          { request, responseHeaders: new Headers(), waitUntil: () => {} },
          () => loadPageModel(request.url)
        )
      ).rejects.toThrow('Public completion must not load an actor');
      expect(ports.actor).toHaveBeenCalledTimes(1);
    }
  );

  it('retains successful token consumption, safe destination and verifier cookies', async () => {
    const headers = new Headers();
    headers.append(
      'set-cookie',
      'tuturuuu_app_session=disposable; HttpOnly; Secure; Path=/'
    );
    headers.append(
      'set-cookie',
      'tuturuuu_web_app_session=disposable-web; HttpOnly; Secure; Path=/'
    );
    outbound.mockImplementation(async () =>
      Response.json(
        { valid: true, appSessionCreated: true, userId: 'disposable-user' },
        { headers }
      )
    );
    const request = new Request(
      `${origin}/vi/verify-token?token=disposable&nextUrl=%2Fpersonal`
    );
    const { response, render } = await dispatch(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${origin}/personal`);
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
    expect(render).not.toHaveBeenCalled();
    expect(outbound).toHaveBeenCalledTimes(1);
    expect(outbound).toHaveBeenCalledWith(
      new URL(`${origin}/api/auth/verify-app-token`),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'disposable' }),
      })
    );
  });

  it.each([401, 200])(
    'retains failed token verification redirects for status %s',
    async (status) => {
      outbound.mockImplementation(async () =>
        Response.json({ valid: false }, { status })
      );
      const { response, render } = await dispatch(
        new Request(
          `${origin}/verify-token?token=invalid&nextUrl=https://evil.invalid`,
          { headers: { cookie: 'sb-old-auth-token=stale' } }
        )
      );
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${origin}/`);
      expect(response.headers.getSetCookie()).toEqual(
        expect.arrayContaining([expect.stringContaining('sb-old-auth-token=;')])
      );
      expect(render).not.toHaveBeenCalled();
      expect(outbound).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps empty token parameters on the existing consumed fallback contract', async () => {
    const { response, render } = await dispatch(
      new Request(`${origin}/verify-token?token=`)
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${origin}/`);
    expect(render).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each(['/personal', '/vi/personal'])(
    'does not open protected %s',
    async (path) => {
      const { response, render } = await dispatch(
        new Request(`${origin}${path}`)
      );
      expect(response.status).toBe(307);
      expect(render).not.toHaveBeenCalled();
      expect(ports.actor).not.toHaveBeenCalled();
      expect(ports.data).not.toHaveBeenCalled();
    }
  );

  it('does not turn invalid protected-page credentials into an anonymous completion', async () => {
    const { response, render } = await dispatch(
      new Request(`${origin}/personal`, {
        headers: {
          cookie:
            'tuturuuu_app_session=invalid; tuturuuu_web_app_session=invalid',
        },
      })
    );
    expect(response.status).toBe(307);
    expect(render).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', '/verify-token'],
    ['GET', '/verify-token?token='],
    ['GET', '/verify-token?token=invalid'],
  ])(
    'keeps %s %s outside the anonymous page-model branch',
    async (method, path) => {
      const request = new Request(`${origin}${path}`, { method });
      await expect(
        withCalendarRequest(
          { request, responseHeaders: new Headers(), waitUntil: () => {} },
          () => loadPageModel(request.url)
        )
      ).rejects.toThrow('Public completion must not load an actor');
      expect(ports.actor).toHaveBeenCalledTimes(1);
    }
  );

  it('does not render a tokenless POST as a public completion document', async () => {
    const { response, render } = await dispatch(
      new Request(`${origin}/verify-token`, { method: 'POST' })
    );
    expect(response.status).toBe(307);
    expect(render).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });
});

it.each(['GET', 'HEAD'])(
  'keeps real public completion %s safe for a wildcard language preference',
  async (method) => {
    const { response, render } = await dispatch(
      new Request(`${origin}/verify-token`, {
        method,
        headers: { 'accept-language': '*' },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('location')).toBe(false);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'"
    );
    expect(await response.text()).toContain('lang="en"');
    expect(render).toHaveBeenCalledTimes(1);
    expect(ports.actor).not.toHaveBeenCalled();
    expect(ports.data).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  }
);

it.each([
  ['*', 'en'],
  ['*;q=1,vi-VN;q=0.8,en-US;q=0.5', 'vi'],
  ['en_US,vi-VN;q=0.8', 'vi'],
  ['vi;q=0,*;q=0', 'en'],
])(
  'keeps real login locale middleware safe for browser preference %s',
  async (language, locale) => {
    const request = new Request(`${origin}/login`, {
      headers: { 'accept-language': language },
    });
    const response = await proxy(new NextRequest(request));
    expect(response.headers.has('location')).toBe(false);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      `${origin}/${locale}/login`
    );
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale')
    ).toBe(locale);
    expect(outbound).not.toHaveBeenCalled();
    expect(ports.data).not.toHaveBeenCalled();
  }
);

it.each([
  ['/verify-token', 'NEXT_LOCALE=vi', '*', 'vi'],
  ['/en/verify-token', 'NEXT_LOCALE=vi', '*', 'en'],
  ['/vi/verify-token', 'NEXT_LOCALE=en', '*', 'vi'],
  ['/verify-token', 'NEXT_LOCALE=unsupported', '*;q=1,vi-VN;q=0.8', 'vi'],
])(
  'keeps real public completion locale precedence for %s with %s',
  async (path, cookie, language, locale) => {
    const { response } = await dispatch(
      new Request(`${origin}${path}`, {
        headers: { cookie, 'accept-language': language },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('location')).toBe(false);
    expect(await response.text()).toContain(`lang="${locale}"`);
    expect(ports.actor).not.toHaveBeenCalled();
    expect(ports.data).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  }
);
