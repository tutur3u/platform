// @vitest-environment node
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { expect, it } from 'vitest';
import { createProductMarketingRedirects } from './product-marketing-redirects';

const nextConfig = {
  async redirects() {
    return createProductMarketingRedirects();
  },
};

it.each([
  ['/meet', '/products/meet'],
  ['/vi/meet', '/vi/products/meet'],
  ['/meet/plans/one', '/products/meet/plans/one'],
  ['/vi/meet/plans/one', '/vi/products/meet/plans/one'],
  ['/calendar', '/products/calendar'],
  ['/vi/calendar', '/vi/products/calendar'],
  ['/ai', '/products/ai'],
  ['/vi/ai', '/vi/products/ai'],
])('temporarily redirects %s to its product page', async (source, target) => {
  const response = await unstable_getResponseFromNextConfig({
    url: `https://tuturuuu.com${source}?tag=one%2Ftwo&tag=three+four&empty=`,
    nextConfig,
  });
  expect(response.status).toBe(307);
  const redirectUrl = getRedirectUrl(response);
  if (redirectUrl === null) throw new Error('Expected a marketing redirect');
  const location = new URL(redirectUrl);
  expect(location.origin).toBe('https://tuturuuu.com');
  expect(location.pathname).toBe(target);
  expect(location.searchParams.getAll('tag')).toEqual([
    'one/two',
    'three four',
  ]);
  expect(location.searchParams.get('empty')).toBe('');
});

it.each([
  '/meet-together',
  '/meet-together/plans/one',
  '/products/meet-together',
  '/calendar/meet-together',
  '/ai/chats/one',
  '/meet/vi',
  '/api/meet-call/one/token',
  '/products/meet',
  '/products/meet/plans/one',
])('does not capture %s', async (path) => {
  const response = await unstable_getResponseFromNextConfig({
    url: `https://tuturuuu.com${path}`,
    nextConfig,
  });
  expect(getRedirectUrl(response)).toBeNull();
});
