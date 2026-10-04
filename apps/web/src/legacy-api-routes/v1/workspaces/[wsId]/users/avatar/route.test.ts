import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-error';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const sessionMock = vi.fn();
const budgetMock = vi.fn();
const getPermissionsMock = vi.fn();
const createSignedUploadUrlMock = vi.fn();
const getPublicUrlMock = vi.fn();

vi.mock('@tuturuuu/storage-core/profile-upload-budget', async () => ({
  ProfileUploadError: (
    await import('@tuturuuu/storage-core/profile-upload-error')
  ).ProfileUploadError,
  reserveProfileUploadBudget: (...args: Parameters<typeof budgetMock>) =>
    budgetMock(...args),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (...args: Parameters<typeof sessionMock>) =>
    sessionMock(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

import { POST } from './route';

describe('workspace user avatar upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    budgetMock.mockReset().mockResolvedValue(undefined);
    createClientMock.mockResolvedValue({ marker: 'request-client' });
    sessionMock.mockResolvedValue({
      user: { id: 'verified-user' },
      authError: null,
    });
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) => permission === 'manage_users',
    });
    createSignedUploadUrlMock.mockResolvedValue({
      data: {
        path: 'workspace-1/users/avatar-1.jpg',
        signedUrl: 'https://supabase.test/upload/avatar-1.jpg',
        token: 'upload-token',
      },
      error: null,
    });
    getPublicUrlMock.mockReturnValue({
      data: {
        publicUrl:
          'https://supabase.test/storage/v1/object/public/avatars/workspace-1/users/avatar-1.jpg',
      },
    });
    createAdminClientMock.mockResolvedValue({
      storage: {
        from: vi.fn((bucket: string) => {
          if (bucket !== 'avatars') {
            throw new Error(`Unexpected bucket lookup: ${bucket}`);
          }

          return {
            createSignedUploadUrl: createSignedUploadUrlMock,
            getPublicUrl: getPublicUrlMock,
          };
        }),
      },
    });
  });

  it('returns a signed upload URL and public avatar URL from the avatars bucket', async () => {
    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/workspace-1/users/avatar',
        {
          body: JSON.stringify({
            fileName: 'avatar-1.jpg',
            contentType: 'image/jpeg',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({ wsId: 'workspace-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(budgetMock).toHaveBeenCalledWith('verified-user', 'avatar');
    expect(budgetMock.mock.invocationCallOrder[0]).toBeLessThan(
      createAdminClientMock.mock.invocationCallOrder[0]!
    );
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith(
      'workspace-1/users/avatar-1.jpg'
    );
    expect(getPublicUrlMock).toHaveBeenCalledWith(
      'workspace-1/users/avatar-1.jpg'
    );
    await expect(response.json()).resolves.toMatchObject({
      publicUrl:
        'https://supabase.test/storage/v1/object/public/avatars/workspace-1/users/avatar-1.jpg',
      signedUrl: 'https://supabase.test/upload/avatar-1.jpg',
      token: 'upload-token',
    });
  });

  it.each([429, 503])(
    'does not issue a ticket when upload budgeting returns %s',
    async (status) => {
      budgetMock.mockRejectedValue(
        new ProfileUploadError(
          'Upload denied',
          status,
          status === 429 ? 60 : undefined
        )
      );
      const response = await POST(
        new NextRequest(
          'http://localhost/api/v1/workspaces/workspace-1/users/avatar',
          {
            method: 'POST',
            body: JSON.stringify({
              fileName: 'avatar.jpg',
              contentType: 'image/jpeg',
            }),
          }
        ),
        { params: Promise.resolve({ wsId: 'workspace-1' }) }
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('Retry-After')).toBe(
        status === 429 ? '60' : null
      );
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
    }
  );
});
