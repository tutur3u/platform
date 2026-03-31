import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceTaskUploadUrl,
  uploadWorkspaceTaskFile,
} from './storage';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe('workspace task upload helpers', () => {
  it('requests task upload URL from dedicated task endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        signedUrl: 'https://upload.example.com/signed',
        token: 'token-1',
        path: 'task-images/task-1/file.png',
        fullPath: 'ws-1/task-images/task-1/file.png',
      })
    );

    await createWorkspaceTaskUploadUrl(
      'ws-1',
      'file.png',
      { taskId: '11111111-1111-4111-8111-111111111111' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks/upload-url',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filename: 'file.png',
          taskId: '11111111-1111-4111-8111-111111111111',
        }),
        cache: 'no-store',
      })
    );
  });

  it('retries upload without content-type when first PUT fails', async () => {
    const file = new File(['hello'], 'file.png', { type: 'image/png' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          signedUrl: 'https://upload.example.com/signed',
          token: 'token-1',
          path: 'task-images/file.png',
          fullPath: 'ws-1/task-images/file.png',
        })
      )
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });

    const result = await uploadWorkspaceTaskFile('ws-1', file, undefined, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://upload.example.com/signed',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'Content-Type': 'image/png',
        }),
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://upload.example.com/signed',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
      })
    );

    expect(result).toEqual({
      path: 'task-images/file.png',
      fullPath: 'ws-1/task-images/file.png',
    });
  });
});
