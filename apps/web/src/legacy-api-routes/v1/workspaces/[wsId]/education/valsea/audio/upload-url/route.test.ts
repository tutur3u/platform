import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UploadHandler = (
  request: NextRequest,
  context: {
    supabase: Record<string, never>;
    user: { id: string };
  },
  params: { wsId: string }
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  checkEducationWorkspaceAccess: vi.fn(),
  createWorkspaceStorageUploadPayload: vi.fn(),
  getPermissions: vi.fn(),
  randomUUID: vi.fn(() => 'audio-id'),
  serverLogger: {
    error: vi.fn(),
  },
  withSessionAuth: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();

  return {
    ...actual,
    default: actual,
    randomUUID: mocks.randomUUID,
  };
});

vi.mock('@tuturuuu/utils/constants', () => ({
  resolveWorkspaceId: (wsId: string) => wsId,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@/lib/education/access', () => ({
  checkEducationWorkspaceAccess: mocks.checkEducationWorkspaceAccess,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageUploadPayload:
    mocks.createWorkspaceStorageUploadPayload,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

function permissions(granted: string[]) {
  return {
    withoutPermission: (permission: string) => !granted.includes(permission),
  };
}

function createRequest() {
  return new NextRequest(
    'http://localhost/api/v1/workspaces/workspace-1/education/valsea/audio/upload-url',
    {
      body: JSON.stringify({
        contentType: 'audio/webm',
        filename: 'classroom.webm',
        size: 1024,
      }),
      method: 'POST',
    }
  );
}

async function postUploadUrl() {
  const { POST } = await import('./route');
  return POST(createRequest(), {
    params: Promise.resolve({ wsId: 'workspace-1' }),
  });
}

describe('Valsea audio upload-url route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.withSessionAuth.mockImplementation(
      (handler: UploadHandler) =>
        async (
          request: NextRequest,
          context: { params: Promise<{ wsId: string }> }
        ) =>
          handler(
            request,
            {
              supabase: {},
              user: { id: 'user-1' },
            },
            await context.params
          )
    );
    mocks.checkEducationWorkspaceAccess.mockResolvedValue({
      normalizedWsId: 'workspace-1',
      ok: true,
      sbAdmin: {},
    });
    mocks.getPermissions.mockResolvedValue(permissions(['manage_drive']));
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      filename: 'audio-id-classroom.webm',
      fullPath: 'workspace-1/education/valsea/audio/audio-id-classroom.webm',
      headers: { 'Content-Type': 'audio/webm' },
      path: 'education/valsea/audio/audio-id-classroom.webm',
      provider: 'r2',
      signedUrl: 'https://storage.example.com/upload',
      token: undefined,
    });
  });

  it('rejects members without manage_drive before signing uploads', async () => {
    mocks.getPermissions.mockResolvedValue(permissions([]));

    const response = await postUploadUrl();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('creates Valsea audio upload URLs for Drive managers', async () => {
    const response = await postUploadUrl();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fullPath: 'workspace-1/education/valsea/audio/audio-id-classroom.webm',
      path: 'education/valsea/audio/audio-id-classroom.webm',
      signedUrl: 'https://storage.example.com/upload',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      expect.stringMatching(
        /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-classroom\.webm$/u
      ),
      {
        contentType: 'audio/webm',
        path: 'education/valsea/audio',
        size: 1024,
        upsert: false,
      }
    );
  });
});
