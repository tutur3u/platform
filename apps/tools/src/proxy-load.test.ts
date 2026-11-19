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
    expect(response.headers.get('location')).toBe(
      `${origin}${basePath}/random?format=hex`
    );
  }
);
