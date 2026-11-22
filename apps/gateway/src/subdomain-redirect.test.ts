import { describe, expect, it, vi } from 'vitest';
import { handleSubdomainRedirect } from './subdomain-redirect';

function setup(apps = 'tasks') {
  const fetch = vi.fn(
    async (request: Request) =>
      new Response(`app ${new URL(request.url).href}`, { status: 200 })
  );
  return {
    fetch,
    env: { SUBDOMAIN_REDIRECT_APPS: apps, APP_TASKS: { fetch } },
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
      'https://tuturuuu.com/tasks/en/ws/boards/b1?x=1&y=2'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps the subdomain root to the bare mount', async () => {
    const { env } = setup();
    const response = await handleSubdomainRedirect(
      new Request('https://tasks.tuturuuu.com/?q=1', { headers: navigation }),
      env
    );
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/tasks?q=1'
    );
  });

  it.each([
    'https://tasks.tuturuuu.com/api/v1/workspaces/w/tasks',
    'https://tasks.tuturuuu.com/_serverFn/abc',
    'https://tasks.tuturuuu.com/assets/index-abcdef12.js',
    'https://tasks.tuturuuu.com/verify-token?token=t&nextUrl=%2F',
    'https://tasks.tuturuuu.com/en/verify-token?token=t',
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

  it('passes non-navigation requests and mutations through', async () => {
    const { env, fetch } = setup();
    await handleSubdomainRedirect(
      new Request('https://tasks.tuturuuu.com/en/ws', {
        headers: { 'sec-fetch-mode': 'cors' },
      }),
      env
    );
    await handleSubdomainRedirect(
      new Request('https://tasks.tuturuuu.com/en/ws', {
        method: 'POST',
        headers: navigation,
        body: 'x',
      }),
      env
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('serves an unlisted app through its binding without redirecting', async () => {
    const { env, fetch } = setup('');
    const response = await handleSubdomainRedirect(
      new Request('https://tasks.tuturuuu.com/en/ws', { headers: navigation }),
      env
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    'https://evil.example/tasks',
    'https://tuturuuu.com/tasks',
    'https://a.tasks.tuturuuu.com/',
    'https://finance.tuturuuu.com/',
    'https://tasks.tuturuuu.com.evil.example/',
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
