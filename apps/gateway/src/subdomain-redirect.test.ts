import { describe, expect, it, vi } from 'vitest';
import { handleSubdomainRedirect } from './subdomain-redirect';

function setup(apps = 'tasks', app = 'tasks') {
  const fetch = vi.fn(
    async (request: Request) =>
      new Response(`app ${new URL(request.url).href}`, { status: 200 })
  );
  return {
    fetch,
    env: {
      SUBDOMAIN_REDIRECT_APPS: apps,
      [`APP_${app.toUpperCase()}`]: { fetch },
    },
  };
}

const navigation = { 'sec-fetch-mode': 'navigate', accept: 'text/html' };

describe('handleSubdomainRedirect', () => {
  it('301s a Finance deep link with its query and leaves its callback in place', async () => {
    const { fetch } = setup();
    const env = {
      SUBDOMAIN_REDIRECT_APPS: 'apps,finance',
      APP_FINANCE: { fetch },
    };
    const response = await handleSubdomainRedirect(
      new Request(
        'https://finance.tuturuuu.com/vi/personal/wallets?ref=a&ref=b',
        {
          headers: { accept: 'text/html' },
        }
      ),
      env
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/finance/vi/personal/wallets?ref=a&ref=b'
    );
    expect(fetch).not.toHaveBeenCalled();

    const callback =
      'https://finance.tuturuuu.com/verify-token?nextUrl=%2Fpersonal';
    await handleSubdomainRedirect(
      new Request(callback, { headers: navigation }),
      env
    );
    expect(fetch.mock.calls[0]?.[0].url).toBe(callback);
  });

  it('301s a listed app navigation to its mount with path and query', async () => {
    const { env, fetch } = setup();
    const response = await handleSubdomainRedirect(
      new Request('https://tasks.tuturuuu.com/en/ws/boards/b1?x=1&y=2', {
        headers: navigation,
      }),
      env
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/tasks/ws/boards/b1?x=1&y=2'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['apps', 'calendar', 'mail', 'meet', 'tasks'])(
    'maps the %s subdomain root to the bare mount',
    async (app) => {
      const { env, fetch } = setup(app, app);
      const response = await handleSubdomainRedirect(
        new Request(`https://${app}.tuturuuu.com/?q=1`, {
          headers: { accept: 'text/html' },
        }),
        env
      );
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        `https://tuturuuu.com/${app}?q=1`
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['/en/', ''],
    ['/en', ''],
    ['/enigma', '/enigma'],
    ['/vi/', '/vi'],
    ['/vi/ws/r%C3%A9sum%C3%A9/', '/vi/ws/r%C3%A9sum%C3%A9'],
  ])('maps %s to %s and preserves the query in HEAD', async (path, suffix) => {
    const { env, fetch } = setup();
    const response = await handleSubdomainRedirect(
      new Request(`https://tasks.tuturuuu.com${path}?x=%2F&x=a+b`, {
        method: 'HEAD',
        headers: navigation,
      }),
      env
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      `https://tuturuuu.com/tasks${suffix}?x=%2F&x=a+b`
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://tasks.tuturuuu.com/api/v1/workspaces/w/tasks',
    'https://tasks.tuturuuu.com/_serverFn/abc',
    'https://tasks.tuturuuu.com/assets/index-abcdef12.js',
    'https://tasks.tuturuuu.com/verify-token?token=t&nextUrl=%2F',
    'https://tasks.tuturuuu.com/en/verify-token?token=t',
    'https://tasks.tuturuuu.com/vi/verify-token?token=t',
    'https://tasks.tuturuuu.com/vi/api/v1/workspaces/w/tasks',
    'https://tasks.tuturuuu.com/serwist/sw.js',
    'https://tasks.tuturuuu.com/offline.html',
    'https://tasks.tuturuuu.com/.well-known/apple-app-site-association',
  ])('passes machine path %s through to the app', async (href) => {
    const { env, fetch } = setup();
    const response = await handleSubdomainRedirect(
      new Request(href, { headers: navigation }),
      env
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0].url).toBe(href);
  });

  it.each([
    ['calendar', '/api/v1/calendar/auth/callback?code=fixture'],
    ['calendar', '/_calendar/functions/fixture'],
    ['calendar', '/_fn/fixture'],
    ['mail', '/api/v1/webhooks/mail/cloudflare'],
    ['mail', '/_mail/fixture'],
    ['mail', '/_rum'],
    ['meet', '/realtime'],
    ['meet', '/live-connect'],
    ['meet', '/_meet'],
    ['meet', '/vi/native-collaboration'],
  ])('passes the %s integration path %s through', async (app, path) => {
    const { env, fetch } = setup(app, app);
    const request = new Request(`https://${app}.tuturuuu.com${path}`, {
      headers: navigation,
    });
    expect((await handleSubdomainRedirect(request, env)).status).toBe(200);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('passes non-navigation requests and mutations through', async () => {
    const { env, fetch } = setup();
    await handleSubdomainRedirect(
      new Request('https://tasks.tuturuuu.com/en/ws', {
        headers: { 'sec-fetch-mode': 'cors' },
      }),
      env
    );
    const mutation = new Request('https://tasks.tuturuuu.com/en/ws', {
      method: 'POST',
      headers: navigation,
      body: 'x',
    });
    await handleSubdomainRedirect(mutation, env);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe(mutation);
    expect(await mutation.text()).toBe('x');
  });

  it.each([
    ['finance', 'apps,calendar,mail,meet,tasks'],
    ['mastermind', 'apps,mastermind'],
  ])('leaves the %s subdomain in service', async (app, apps) => {
    const { env, fetch } = setup(apps, app);
    const request = new Request(`https://${app}.tuturuuu.com/en/ws`, {
      headers: navigation,
    });
    expect((await handleSubdomainRedirect(request, env)).status).toBe(200);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each([
    'https://evil.example/tasks',
    'https://tuturuuu.com/tasks',
    'https://a.tasks.tuturuuu.com/',
    'https://finance.tuturuuu.com/',
    'https://tasks.tuturuuu.com.evil.example/',
    'https://api.tuturuuu.com/',
  ])('refuses %s, which has no app binding', async (href) => {
    const { env, fetch } = setup();
    const response = await handleSubdomainRedirect(
      new Request(href, { headers: navigation }),
      env
    );
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
