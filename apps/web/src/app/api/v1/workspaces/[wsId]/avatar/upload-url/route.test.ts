// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  budget: vi.fn(),
  signer: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: vi.fn(async () => 'verified-workspace'),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: f.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: f.admin,
}));
vi.mock(
  '@tuturuuu/storage-core/profile-upload-budget',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    reserveProfileUploadBudget: f.budget,
  })
);

import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { POST } from './route';

async function request() {
  return (POST as any)(
    new NextRequest(
      'https://example.test/api/v1/workspaces/verified-workspace/avatar/upload-url',
      { method: 'POST', body: JSON.stringify({ filename: 'avatar.png' }) }
    ),
    { user: { id: 'resolved-actor' } },
    { wsId: 'verified-workspace' }
  );
}
describe('authorized workspace avatar budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.permissions.mockResolvedValue({ withoutPermission: () => false });
    f.budget.mockResolvedValue(undefined);
    f.signer.mockResolvedValue({
      data: {
        signedUrl: 'https://example.test/ticket',
        token: 'synthetic-ticket',
      },
      error: null,
    });
    f.admin.mockResolvedValue({
      storage: {
        from: () => ({
          createSignedUploadUrl: f.signer,
          getPublicUrl: () => ({
            data: { publicUrl: 'https://example.test/avatar.png' },
          }),
        }),
      },
    });
  });
  it('reserves the resolved account before issuing privileged tickets', async () => {
    expect((await request()).status).toBe(200);
    expect(f.budget).toHaveBeenCalledWith('resolved-actor', 'avatar');
    expect(f.budget.mock.invocationCallOrder[0]).toBeLessThan(
      f.signer.mock.invocationCallOrder[0]!
    );
  });
  it.each([429, 503])(
    'quota/protection failure %s never signs or creates an admin client',
    async (status) => {
      f.budget.mockRejectedValue(
        new ProfileUploadError(
          'Shared budget unavailable',
          status,
          status === 429 ? 90 : undefined
        )
      );
      const response = await request();
      expect(response.status).toBe(status);
      expect(f.signer).not.toHaveBeenCalled();
      expect(f.admin).not.toHaveBeenCalled();
      if (status === 429)
        expect(response.headers.get('Retry-After')).toBe('90');
    }
  );
  it('unauthorized workspaces never reserve or sign', async () => {
    f.permissions.mockResolvedValue(null);
    expect((await request()).status).toBe(403);
    expect(f.budget).not.toHaveBeenCalled();
    expect(f.signer).not.toHaveBeenCalled();
  });
});
