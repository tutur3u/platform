import { vi } from 'vitest';
import {
  definePageAdapterTests,
  pageAdapterMocks,
} from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('next-intl/middleware', () => ({
  default: () => pageAdapterMocks.continuation,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

import { proxy } from './proxy';

definePageAdapterTests({ proxy, targetApp: 'ai' });

import { describe, expect, it } from 'vitest';
import { createBridgeHandler } from '@tuturuuu/start-bridge/start/handler';
import { appPath, runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import appConfig from '../start-bridge.config';

// Only the production profile admits the apex mount; the config reads it
// once at import.
vi.hoisted(() => {
  process.env.VITE_AI_NATIVE_PROFILE = 'production';
});

const mountedHandler = createBridgeHandler({
  mounts: { app: 'ai', rootHosts: ['ai.tuturuuu.com'], ...appConfig.mounts },
  proxy,
  assets: () => ({
    fetch: async (request: string) => new Response(new URL(request).pathname),
  }),
  centralApiOrigin: () => 'https://tuturuuu.com',
  start: {
    fetch: async () =>
      Response.json({
        base: runtimeAppBase(),
        asset: appPath('/assets/chunk.js'),
        locale: appPath('/messages/vi.json'),
        api: appPath('/api/owned'),
      }),
  },
});
const ctx = { waitUntil(_work: Promise<unknown>) {} };
describe('ai mount isolation', () => {
  it.each([
    [
      'https://ai.tuturuuu.com/en/auth-error',
      '/',
      'https://ai.tuturuuu.com/auth-error',
    ],
    [
      'https://tuturuuu.com/ai/en/auth-error',
      '/ai',
      'https://tuturuuu.com/ai/auth-error',
    ],
  ])(
    'canonicalizes locale with host-only cookies at %s',
    async (url, path, location) => {
      const result = await mountedHandler(new Request(url), {}, ctx);
      expect(result.status).toBe(307);
      expect(result.headers.get('location')).toBe(location);
      const cookies = result.headers.getSetCookie();
      expect(
        cookies.some((cookie) => cookie.startsWith('NEXT_LOCALE=en;'))
      ).toBe(true);
      for (const cookie of cookies) {
        expect(cookie).not.toMatch(/domain=/i);
        expect(cookie).toContain(`Path=${path};`);
      }
    }
  );
  it('resolves runtime URLs and strips asset requests per mount', async () => {
    const result = await mountedHandler(
      new Request('https://tuturuuu.com/ai/assets/chunk.js'),
      {},
      ctx
    );
    expect(await result.text()).toBe('/assets/chunk.js');
    const rendered = await mountedHandler(
      new Request('https://tuturuuu.com/ai/auth-error'),
      {},
      ctx
    );
    expect(await rendered.json()).toEqual({
      base: '/ai',
      asset: '/ai/assets/chunk.js',
      locale: '/ai/messages/vi.json',
      api: '/ai/api/owned',
    });
    expect(
      (
        await mountedHandler(
          new Request('https://tuturuuu.com/another'),
          {},
          ctx
        )
      ).status
    ).toBe(404);
  });
});
