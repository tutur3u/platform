// @vitest-environment node
import { NextRequest } from 'next/server';
import { expect, it } from 'vitest';

it('loads the proxy module with its handler and matcher', async () => {
  const module = await import('./proxy');
  expect(typeof module.proxy).toBe('function');
  expect(module.config?.matcher).toBeTruthy();
});

it.each([
  ['https://tools.tuturuuu.com', ''],
  ['https://tuturuuu.com', '/tools'],
])(
  'keeps the locale redirect on %s at its configured base',
  async (origin, basePath) => {
    const { proxy } = await import('./proxy');
    const request = new NextRequest(
      `${origin}${basePath}/vi/random?format=hex`,
      {
        nextConfig: { basePath },
      }
    );
    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('vi');
    expect(response.headers.get('location')).toBe(
      `${origin}${basePath}/random?format=hex`
    );
  }
);

it.each([
  { name: 'ordinary GET', locale: 'en', requestHeaders: {} },
  {
    name: 'speculative GET',
    locale: 'en',
    requestHeaders: { 'Sec-Purpose': 'prefetch' },
  },
  {
    name: 'Vietnamese GET',
    locale: 'vi',
    requestHeaders: { 'Accept-Language': 'vi' },
  },
])(
  'renders the apex Tools entry without cookie writes for $name',
  async ({ locale, requestHeaders }) => {
    const { proxy } = await import('./proxy');
    const headers = new Headers();
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (value !== undefined) headers.set(key, value);
    }
    const response = await proxy(
      new NextRequest('https://tuturuuu.com/tools?source=sidebar-apps', {
        headers,
        nextConfig: { basePath: '/tools' },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-middleware-set-cookie')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toContain(
      `/tools/${locale}`
    );
  }
);
