import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceAvatarUploadTarget,
  deleteWorkspaceAvatar,
  updateWorkspaceAvatar,
} from './workspaces';

function response(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

describe('workspace avatar internal API helpers', () => {
  it('encodes workspace ids and preserves the avatar mutation contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          filePath: 'workspaces/avatar.png',
          publicUrl: 'https://cdn.example.com/avatar.png',
          signedUrl: 'https://storage.example.com/upload',
          token: 'token',
        })
      )
      .mockResolvedValueOnce(
        response({
          avatarUrl: 'https://cdn.example.com/avatar.png',
          success: true,
        })
      )
      .mockResolvedValueOnce(response({ success: true }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await createWorkspaceAvatarUploadTarget(
      'workspace / 1',
      'avatar.png',
      options
    );
    await updateWorkspaceAvatar(
      'workspace / 1',
      'workspaces/avatar.png',
      options
    );
    await deleteWorkspaceAvatar('workspace / 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%20%2F%201/avatar/upload-url',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      filename: 'avatar.png',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%20%2F%201/avatar',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      filePath: 'workspaces/avatar.png',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/workspace%20%2F%201/avatar',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
