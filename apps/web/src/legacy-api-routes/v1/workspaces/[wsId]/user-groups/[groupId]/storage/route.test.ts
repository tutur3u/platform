import { File as NodeFile } from 'node:buffer';
import { type NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  generateRandomUUID: vi.fn(() => 'upload-id'),
  requireTeachWorkspaceAccess: vi.fn(),
  triggerWorkspaceStorageAutoExtract: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

const groupLookup = vi.hoisted(() => {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(),
    select: vi.fn(() => query),
  };

  return query;
});

vi.mock('@tuturuuu/utils/uuid-helper', () => ({
  generateRandomUUID: mocks.generateRandomUUID,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      (
        handler as (
          request: Request,
          context: { user: { id: string } },
          params: { groupId: string; wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' } },
        (await routeContext?.params) as { groupId: string; wsId: string }
      ),
}));

vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-auto-extract', () => ({
  triggerWorkspaceStorageAutoExtract: mocks.triggerWorkspaceStorageAutoExtract,
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  listWorkspaceStorageDirectory: vi.fn(),
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

function createUploadRequest(file: File, fields: Record<string, string> = {}) {
  return {
    formData: async () => ({
      get: (key: string) => {
        if (key === 'file') return file;
        return fields[key] ?? null;
      },
    }),
    url: `http://localhost/api/v1/workspaces/workspace-1/user-groups/${GROUP_ID}/storage`,
  } as unknown as NextRequest;
}

function createJsonRequest(_payload: Record<string, unknown>) {
  return {
    formData: async () => {
      throw new Error('Invalid form data');
    },
    url: `http://localhost/api/v1/workspaces/workspace-1/user-groups/${GROUP_ID}/storage`,
  } as unknown as NextRequest;
}

async function postGroupStorageFile(
  file: File,
  fields: Record<string, string> = {}
) {
  const { POST } = await import('./route');

  return POST(createUploadRequest(file, fields), {
    params: Promise.resolve({ groupId: GROUP_ID, wsId: 'workspace-1' }),
  });
}

async function postGroupStorageJson(payload: Record<string, unknown>) {
  const { POST } = await import('./route');

  return POST(createJsonRequest(payload), {
    params: Promise.resolve({ groupId: GROUP_ID, wsId: 'workspace-1' }),
  });
}

describe('workspace user-group storage route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('File', NodeFile);
    mocks.generateRandomUUID.mockClear();
    mocks.requireTeachWorkspaceAccess.mockReset();
    mocks.triggerWorkspaceStorageAutoExtract.mockReset();
    mocks.uploadWorkspaceStorageFileDirect.mockReset();
    groupLookup.eq.mockClear();
    groupLookup.maybeSingle.mockReset();
    groupLookup.select.mockClear();

    groupLookup.maybeSingle.mockResolvedValue({
      data: { id: GROUP_ID },
      error: null,
    });
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: 'workspace-1',
      ok: true,
      sbAdmin: {
        from: vi.fn((table: string) => {
          if (table === 'workspace_user_groups') {
            return groupLookup;
          }

          throw new Error(`Unexpected table: ${table}`);
        }),
      },
    });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath: `workspace-1/user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      path: `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
    });
    mocks.triggerWorkspaceStorageAutoExtract.mockResolvedValue({
      archivePath: `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      message: 'Uploaded file is not a ZIP archive.',
      status: 'skipped',
    });
  });

  it('uploads group storage files through the app server after validating metadata', async () => {
    const file = new NodeFile(['hello'], 'syllabus.pdf', {
      type: 'application/pdf',
    }) as File;
    const response = await postGroupStorageFile(file);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      autoExtract: {
        archivePath: `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
        message: 'Uploaded file is not a ZIP archive.',
        status: 'skipped',
      },
      autoExtractError: null,
      data: {
        fullPath: `workspace-1/user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
        path: `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      },
      message: 'File uploaded successfully',
    });
    expect(mocks.requireTeachWorkspaceAccess).toHaveBeenCalledWith({
      context: { user: { id: 'user-1' } },
      permission: 'update_user_groups',
      wsId: 'workspace-1',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'workspace-1',
      `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      expect.any(Uint8Array),
      {
        contentType: 'application/pdf',
        upsert: false,
      }
    );
    const uploadedBytes = mocks.uploadWorkspaceStorageFileDirect.mock
      .calls[0]?.[2] as Uint8Array;
    expect(uploadedBytes.byteLength).toBe(5);
    expect(mocks.triggerWorkspaceStorageAutoExtract).toHaveBeenCalledWith(
      'workspace-1',
      {
        contentType: 'application/pdf',
        originalFilename: 'syllabus.pdf',
        path: `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
        requestOrigin: 'http://localhost',
      }
    );
  });

  it('rejects legacy signed upload URL JSON requests before storage writes', async () => {
    const response = await postGroupStorageJson({
      contentType: 'application/pdf',
      filename: 'syllabus.pdf',
      size: 1,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid upload body',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects empty group storage uploads before storage writes', async () => {
    const response = await postGroupStorageFile(
      new NodeFile([], 'empty.pdf', { type: 'application/pdf' }) as File
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'File is empty',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects disallowed group storage file types before storage writes', async () => {
    const response = await postGroupStorageFile(
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

  it('rejects group storage overwrite uploads', async () => {
    const response = await postGroupStorageFile(
      new NodeFile(['hello'], 'syllabus.pdf', {
        type: 'application/pdf',
      }) as File,
      { upsert: 'true' }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Upload overwrite is not allowed for this path',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('returns access denials before group lookup', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValue(
      NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      )
    );

    const response = await postGroupStorageFile(
      new NodeFile(['hello'], 'syllabus.pdf', {
        type: 'application/pdf',
      }) as File
    );

    expect(response.status).toBe(403);
    expect(groupLookup.select).not.toHaveBeenCalled();
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });
});
