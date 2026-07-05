import { File as NodeFile } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
  triggerWorkspaceStorageAutoExtract: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

vi.mock('@tuturuuu/storage-core/workspace-storage-auto-extract', () => ({
  triggerWorkspaceStorageAutoExtract: mocks.triggerWorkspaceStorageAutoExtract,
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  uploadWorkspaceStorageFileDirect: mocks.uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

vi.mock('../route-auth', () => ({
  logWorkspaceStorageRouteError: mocks.logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth: mocks.resolveWorkspaceStorageRouteAuth,
}));

function createUploadRequest(file: File, path = 'documents') {
  return {
    formData: async () => ({
      get: (key: string) => {
        if (key === 'file') return file;
        if (key === 'path') return path;
        return null;
      },
    }),
    url: 'http://localhost/api/v1/workspaces/workspace-1/storage/upload',
  } as unknown as Request;
}

async function postUpload(file: File) {
  const { POST } = await import('./route');

  return POST(createUploadRequest(file), {
    params: Promise.resolve({ wsId: 'workspace-1' }),
  });
}

describe('workspace storage direct upload route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('File', NodeFile);
    mocks.logWorkspaceStorageRouteError.mockReset();
    mocks.resolveWorkspaceStorageRouteAuth.mockReset();
    mocks.triggerWorkspaceStorageAutoExtract.mockReset();
    mocks.uploadWorkspaceStorageFileDirect.mockReset();
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: (permission: string) =>
            permission !== 'manage_drive',
        },
      },
      ok: true,
    });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath: 'workspace-1/documents/notes.txt',
      path: 'documents/notes.txt',
    });
    mocks.triggerWorkspaceStorageAutoExtract.mockResolvedValue({
      archivePath: 'documents/notes.txt',
      message: 'Uploaded file is not a ZIP archive.',
      status: 'skipped',
    });
  });

  it('uploads valid multipart files through the direct storage provider', async () => {
    const response = await postUpload(
      new NodeFile(['hello'], 'notes.txt', { type: 'text/plain' }) as File
    );

    expect(response.status).toBe(200);
    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'workspace-1',
      'documents/notes.txt',
      expect.any(Uint8Array),
      {
        contentType: 'text/plain',
        upsert: false,
      }
    );
  });

  it('rejects empty multipart files before storage writes', async () => {
    const response = await postUpload(
      new NodeFile([], 'empty.txt', { type: 'text/plain' }) as File
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'File is empty',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects disallowed multipart file types before storage writes', async () => {
    const response = await postUpload(
      new NodeFile(['echo hi'], 'script.sh', {
        type: 'application/octet-stream',
      }) as File
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'File type not allowed',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects uploads into the reserved mobile deployment vault prefix', async () => {
    const { POST } = await import('./route');
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      context: {
        normalizedWsId: ROOT_WORKSPACE_ID,
        permissions: {
          withoutPermission: (permission: string) =>
            permission !== 'manage_drive',
        },
      },
      ok: true,
    });

    const response = await POST(
      createUploadRequest(
        new NodeFile(['secret'], 'google-services.json', {
          type: 'application/json',
        }) as File,
        '.tuturuuu/mobile-deployment-vault/production/android'
      ),
      {
        params: Promise.resolve({ wsId: 'workspace-1' }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });
});
