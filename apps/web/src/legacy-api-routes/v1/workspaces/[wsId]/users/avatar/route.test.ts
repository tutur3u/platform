import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const createSignedUploadUrlMock = vi.fn();
const getPublicUrlMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
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
});
