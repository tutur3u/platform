import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  verifyExternalAppSecret: mocks.verify,
}));
vi.mock('@/lib/external-projects/access', () => ({
  resolveWorkspaceExternalProjectBinding: mocks.resolve,
}));

import { authorizeExternalAppRequest } from './app-credentials';

const admin = {} as TypedSupabaseClient;
describe('machine app binding identity', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ['custom', 'site-b', 'custom', 403],
    ['site-a', 'site-b', 'custom', 403],
    ['site-b', 'site-b', 'custom', undefined],
    ['yashie', 'yashie-main', 'yashie', undefined],
  ])(
    'authorizes %s against %s (%s)',
    async (appId, projectId, adapter, status) => {
      mocks.verify.mockResolvedValue({ ok: true, app: { id: appId } });
      mocks.resolve.mockResolvedValue({
        enabled: true,
        adapter,
        canonical_project: { id: projectId, adapter },
      });
      const result = await authorizeExternalAppRequest({
        admin,
        appId,
        appSecret: 'fixture-secret',
        wsId: 'workspace',
      });
      expect(result.response?.status).toBe(status);
    }
  );
  it('denies disabled bindings', async () => {
    mocks.verify.mockResolvedValue({ ok: true, app: { id: 'yashie' } });
    mocks.resolve.mockResolvedValue({
      enabled: false,
      adapter: 'yashie',
      canonical_project: null,
    });
    const result = await authorizeExternalAppRequest({
      admin,
      appId: 'yashie',
      appSecret: 'fixture-secret',
      wsId: 'workspace',
    });
    expect(result.response?.status).toBe(403);
  });
});
