import { createAppBaseResolver } from '@tuturuuu/start-bridge/start/app-base';
import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { afterEach, expect, it, vi } from 'vitest';
import { appApiPatterns } from '../start-bridge/api-patterns.bridge.gen';
import { centralFirst } from '../start-bridge/central-first';
import { apiFetch } from './api-fetch';

afterEach(() => vi.unstubAllGlobals());

it('uses the mounted Infrastructure API for local requests and preserves Web requests', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('__tuturuuuAppBase', '/infra');
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
  vi.stubGlobal('fetch', fetch);
  const unregister = registerDefaultAppBaseResolver(
    createAppBaseResolver(appApiPatterns, centralFirst),
    { app: 'infrastructure' }
  );
  try {
    await apiFetch('/api/v1/admin/ai-credits/models?query=fast');
    await apiFetch('/api/v1/users/me/profile');
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/infra/api/v1/admin/ai-credits/models?query=fast',
      '/api/v1/users/me/profile',
    ]);
  } finally {
    unregister();
  }
});
