import { type NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageUploadPayload: vi.fn(),
  generateRandomUUID: vi.fn(() => 'upload-id'),
  requireTeachWorkspaceAccess: vi.fn(),
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

vi.mock('@/lib/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  createWorkspaceStorageUploadPayload:
    mocks.createWorkspaceStorageUploadPayload,
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  listWorkspaceStorageDirectory: vi.fn(),
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

function createRequest(payload: Record<string, unknown>) {
  return new Request(
    `http://localhost/api/v1/workspaces/workspace-1/user-groups/${GROUP_ID}/storage`,
    {
      body: JSON.stringify(payload),
      method: 'POST',
    }
  ) as NextRequest;
}

async function postGroupStorage(payload: Record<string, unknown>) {
  const { POST } = await import('./route');

  return POST(createRequest(payload), {
    params: Promise.resolve({ groupId: GROUP_ID, wsId: 'workspace-1' }),
  });
}

describe('workspace user-group storage route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createWorkspaceStorageUploadPayload.mockReset();
    mocks.generateRandomUUID.mockClear();
    mocks.requireTeachWorkspaceAccess.mockReset();
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
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      contentType: 'application/pdf',
      fullPath: `workspace-1/user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      headers: {
        'Content-Type': 'application/pdf',
      },
      path: `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });
  });

  it('creates group storage signed upload URLs after validating metadata', async () => {
    const response = await postGroupStorage({
      contentType: 'application/pdf',
      filename: 'syllabus.pdf',
      size: 128,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentType: 'application/pdf',
      fullPath: `workspace-1/user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      headers: {
        'Content-Type': 'application/pdf',
      },
      path: `user-groups/${GROUP_ID}/upload-id-syllabus.pdf`,
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });
    expect(mocks.requireTeachWorkspaceAccess).toHaveBeenCalledWith({
      context: { user: { id: 'user-1' } },
      permission: 'update_user_groups',
      wsId: 'workspace-1',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'upload-id-syllabus.pdf',
      {
        contentType: 'application/pdf',
        path: `user-groups/${GROUP_ID}`,
        size: 128,
        upsert: false,
      }
    );
  });

  it('rejects empty group storage uploads before signing', async () => {
    const response = await postGroupStorage({
      contentType: 'application/pdf',
      filename: 'empty.pdf',
      size: 0,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'File is empty',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects disallowed group storage file types before signing', async () => {
    const response = await postGroupStorage({
      contentType: 'application/octet-stream',
      filename: 'script.sh',
      size: 128,
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'File type not allowed',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects group storage overwrite signing', async () => {
    const response = await postGroupStorage({
      contentType: 'application/pdf',
      filename: 'syllabus.pdf',
      size: 128,
      upsert: true,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Upload overwrite is not allowed for this path',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('returns access denials before group lookup', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValue(
      NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      )
    );

    const response = await postGroupStorage({
      contentType: 'application/pdf',
      filename: 'syllabus.pdf',
      size: 128,
    });

    expect(response.status).toBe(403);
    expect(groupLookup.select).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });
});
