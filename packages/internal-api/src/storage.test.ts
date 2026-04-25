import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceStorageUploadUrl,
  createWorkspaceTaskUploadUrl,
  deleteWorkspaceStorageObjects,
  uploadWorkspaceStorageFile,
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
  it('deletes Drive files through workspace-scoped authenticated routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ success: true }));

    const result = await deleteWorkspaceStorageObjects(
      'ws-1',
      ['documents/a.txt', 'documents/b.txt'],
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/storage/object',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ path: 'documents/a.txt' }),
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/storage/object',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ path: 'documents/b.txt' }),
        cache: 'no-store',
      })
    );
    expect(result).toEqual({
      message: 'Successfully deleted 2 file(s)',
      data: {
        deleted: 2,
        paths: ['documents/a.txt', 'documents/b.txt'],
      },
    });
  });

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
      })
    );

    const thirdCallOptions = fetchMock.mock.calls[2]?.[1] as {
      headers?: Record<string, string>;
    };
    const thirdCallHeaders = thirdCallOptions?.headers ?? {};
    expect(thirdCallHeaders.Authorization).toBe('Bearer token-1');
    expect(thirdCallHeaders['Content-Type']).toBeUndefined();

    expect(result).toEqual({
      path: 'task-images/file.png',
      fullPath: 'ws-1/task-images/file.png',
    });
  });

  it('supports tokenless signed uploads with provider headers', async () => {
    const file = new File(['hello'], 'file.txt', { type: 'text/plain' });
    const uploadUrlFetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        signedUrl: 'https://upload.example.com/r2-signed',
        headers: {
          'x-amz-acl': 'private',
        },
        path: 'documents/file.txt',
        fullPath: 'ws-1/documents/file.txt',
      })
    );

    const uploadUrl = await createWorkspaceStorageUploadUrl(
      'ws-1',
      'file.txt',
      { path: 'documents', size: file.size },
      {
        baseUrl: 'https://internal.example.com',
        fetch: uploadUrlFetchMock as unknown as typeof fetch,
      }
    );

    expect(uploadUrl).toEqual({
      signedUrl: 'https://upload.example.com/r2-signed',
      headers: {
        'x-amz-acl': 'private',
      },
      token: undefined,
      path: 'documents/file.txt',
      fullPath: 'ws-1/documents/file.txt',
    });

    const uploadFetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          signedUrl: 'https://upload.example.com/r2-signed',
          headers: {
            'x-amz-acl': 'private',
          },
          path: 'documents/file.txt',
          fullPath: 'ws-1/documents/file.txt',
        })
      )
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce(
        createJsonResponse({
          autoExtract: {
            status: 'disabled',
            message: 'ZIP auto extraction is disabled for this workspace.',
          },
        })
      );

    const result = await uploadWorkspaceStorageFile('ws-1', file, undefined, {
      baseUrl: 'https://internal.example.com',
      fetch: uploadFetchMock as unknown as typeof fetch,
    });

    expect(uploadFetchMock).toHaveBeenNthCalledWith(
      2,
      'https://upload.example.com/r2-signed',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Content-Type': expect.stringContaining('text/plain'),
          'x-amz-acl': 'private',
        }),
      })
    );

    const secondCallOptions = uploadFetchMock.mock.calls[1]?.[1] as {
      headers?: Record<string, string>;
    };
    const secondCallHeaders = secondCallOptions?.headers ?? {};
    expect(secondCallHeaders.Authorization).toBeUndefined();

    expect(uploadFetchMock).toHaveBeenNthCalledWith(
      3,
      'https://upload.example.com/r2-signed',
      expect.objectContaining({
        method: 'PUT',
      })
    );
    const thirdCallUploadOptions = uploadFetchMock.mock.calls[2]?.[1] as {
      headers?: Record<string, string>;
    };
    const thirdCallUploadHeaders = thirdCallUploadOptions?.headers ?? {};
    expect(thirdCallUploadHeaders.Authorization).toBeUndefined();
    expect(thirdCallUploadHeaders['x-amz-acl']).toBe('private');
    expect(thirdCallUploadHeaders['Content-Type']).toBeUndefined();

    expect(uploadFetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws-1/storage/finalize-upload',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
      })
    );
    const thirdCallOptions = uploadFetchMock.mock.calls[3]?.[1] as {
      body?: string;
    };
    const thirdCallBody = JSON.parse(thirdCallOptions?.body ?? '{}') as {
      path?: string;
      contentType?: string;
      originalFilename?: string;
    };
    expect(thirdCallBody.path).toBe('documents/file.txt');
    expect(thirdCallBody.contentType).toContain('text/plain');
    expect(thirdCallBody.originalFilename).toBe('file.txt');

    expect(result).toEqual({
      autoExtract: {
        status: 'disabled',
        message: 'ZIP auto extraction is disabled for this workspace.',
      },
      finalize: {
        success: true,
      },
      path: 'documents/file.txt',
      fullPath: 'ws-1/documents/file.txt',
    });
  });

  it('keeps successful uploads successful when finalize fails', async () => {
    const file = new File(['hello'], 'file.txt', { type: 'text/plain' });
    const uploadFetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          signedUrl: 'https://upload.example.com/r2-signed',
          path: 'documents/file.txt',
          fullPath: 'ws-1/documents/file.txt',
        })
      )
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Finalize failed' }),
        text: async () => 'Finalize failed',
      });

    const result = await uploadWorkspaceStorageFile('ws-1', file, undefined, {
      baseUrl: 'https://internal.example.com',
      fetch: uploadFetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({
      finalize: {
        success: false,
        error: 'Finalize failed',
      },
      path: 'documents/file.txt',
      fullPath: 'ws-1/documents/file.txt',
    });
  });

  it('reports upload progress completion for Drive uploads', async () => {
    const file = new File(['hello'], 'file.txt', { type: 'text/plain' });
    const uploadProgress = vi.fn();
    const uploadFetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          signedUrl: 'https://upload.example.com/r2-signed',
          path: 'documents/file.txt',
          fullPath: 'ws-1/documents/file.txt',
        })
      )
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce(createJsonResponse({}));

    await uploadWorkspaceStorageFile(
      'ws-1',
      file,
      {
        onUploadProgress: uploadProgress,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: uploadFetchMock as unknown as typeof fetch,
      }
    );

    expect(uploadProgress).toHaveBeenCalledWith({
      loaded: file.size,
      percent: 100,
      total: file.size,
    });
  });
});
