import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { createAppBaseResolver } from '@tuturuuu/start-bridge/start/app-base';
import { afterEach, expect, it, vi } from 'vitest';
import { appApiPatterns } from '../start-bridge/api-patterns.bridge.gen';
import { centralFirst } from '../start-bridge/central-first';
import { createAiPublicUrl } from './ai-public-url';

vi.mock('@/constants/common', () => ({ BASE_URL: 'https://ai.tuturuuu.com' }));

afterEach(() => vi.unstubAllEnvs());

it('keeps concurrent mounted and subdomain AI URLs request-local', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const resolve = createAppBaseResolver(appApiPatterns, centralFirst);
  await Promise.all(
    [
      { origin: 'https://ai.tuturuuu.com', appBase: '' },
      { origin: 'https://tuturuuu.com', appBase: '/ai' },
    ].map(({ origin, appBase }) =>
      withBridgeRequest(
        { request: new Request(`${origin}${appBase}/one`), appBase },
        async () => {
          await Promise.resolve();
          expect(createAiPublicUrl('/login')).toEqual(
            new URL(`${appBase}/login`, origin)
          );
          expect(resolve('/api/v1/workspaces/one/ai/usage?period=month')).toBe(
            `${origin}${appBase}/api/v1/workspaces/one/ai/usage?period=month`
          );
          expect(resolve('/api/v1/workspaces/one/avatar')).toBe(
            '/api/v1/workspaces/one/avatar'
          );
          expect(resolve('/api/v1/workspaces/one/tasks')).toBe(
            '/api/v1/workspaces/one/tasks'
          );
        }
      )
    )
  );
});

it('retains the configured origin in the legacy production runtime', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(
    createAiPublicUrl('/login', new Request('https://foreign.invalid/'))
  ).toEqual(new URL('https://ai.tuturuuu.com/login'));
});

it('retains local document URLs in the legacy development runtime', () => {
  vi.stubEnv('NODE_ENV', 'development');
  expect(
    createAiPublicUrl('/login', new Request('http://localhost:7829/'))
  ).toEqual(new URL('http://localhost:7829/login'));
});
