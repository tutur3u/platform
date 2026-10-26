import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  canAccessFinanceTransactionStoragePath: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

vi.mock('@/legacy-api-routes/v1/workspaces/[wsId]/storage/route-auth', () => ({
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS: ['drive', 'finance'],
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageRouteAuth: mocks.resolveWorkspaceStorageRouteAuth,
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl:
    mocks.createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
}));

vi.mock('@tuturuuu/finance-core/storage-access', () => ({
  canAccessFinanceTransactionStoragePath:
    mocks.canAccessFinanceTransactionStoragePath,
}));

const params = { params: Promise.resolve({ wsId: 'ws-123' }) };

function shareRequest(path: string) {
  return new Request(
    `http://localhost/api/v1/workspaces/ws-123/storage/share?path=${encodeURIComponent(path)}`
  );
}

describe('workspace storage share app session audience', () => {
  beforeEach(() => {
    mocks.canAccessFinanceTransactionStoragePath.mockReset();
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);
    mocks.createWorkspaceStorageSignedReadUrl.mockReset();
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example/signed-media'
    );
    mocks.resolveWorkspaceStorageRouteAuth.mockReset();
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    });
  });

  it('accepts Tasks app sessions for task media paths', async () => {
    const response = await GET(shareRequest('task-images/media.png'), params);

    expect(response.status).toBe(401);
    expect(mocks.resolveWorkspaceStorageRouteAuth).toHaveBeenCalledWith(
      expect.any(Request),
      'ws-123',
      { appSessionTargets: ['drive', 'finance', 'tasks'] }
    );
  });

  it('does not accept Tasks app sessions for unrelated storage paths', async () => {
    await GET(shareRequest('finance/receipt.pdf'), params);

    expect(mocks.resolveWorkspaceStorageRouteAuth).toHaveBeenCalledWith(
      expect.any(Request),
      'ws-123',
      { appSessionTargets: ['drive', 'finance'] }
    );
  });

  it('rejects traversal before choosing an app session audience', async () => {
    const response = await GET(
      shareRequest('task-images/../finance/receipt.pdf'),
      params
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveWorkspaceStorageRouteAuth).not.toHaveBeenCalled();
  });

  it('reads task media with the upload permission even without general Drive access', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-123',
        permissions: {
          withoutPermission: (permission: string) =>
            permission === 'view_drive',
        },
        supabase: {},
        userId: 'user-1',
      },
    });

    const response = await GET(shareRequest('task-images/media.png'), params);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://storage.example/signed-media'
    );
  });

  it('rejects task media without the task media permission', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-123',
        permissions: {
          withoutPermission: (permission: string) =>
            permission === 'manage_drive_tasks_directory',
        },
        supabase: {},
        userId: 'user-1',
      },
    });

    const response = await GET(shareRequest('task-images/media.png'), params);

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });
});

// Both members belong to ws-123; only member A owns these private resources.
describe('Drive sharing does not authorize private chat resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example/signed-object'
    );
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-123',
        userId: 'member-b',
        permissions: {
          withoutPermission: (permission: string) =>
            permission !== 'view_drive',
        },
        supabase: {},
      },
    });
  });

  it.each([
    'chats/ai/resources/member-a-chat/notes.txt',
    'chats/ai/resources/member-a-mind-thread/notes.txt',
    'chats/ai/resources/member-a-chat/quarantined.html',
    'chats/ai/resources/temp/member-a/pending.pdf',
    'chats/member-a-native-conversation/photo.png',
    'chats',
    'external-apps/example/chat/conversation/attachment/notes.pdf',
    '%63hats/ai/resources/member-a-chat/notes.txt',
    '%2563hats/ai/resources/member-a-chat/notes.txt',
  ])('denies GET and POST sharing of %s', async (path) => {
    const redirect = await GET(shareRequest(path), params);
    expect(redirect.status).toBe(403);
    const share = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-123/storage/share', {
        method: 'POST',
        body: JSON.stringify({ path }),
      }),
      params
    );
    expect(share.status).toBe(403);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('keeps member B own Drive file shareable', async () => {
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-123/storage/share', {
        method: 'POST',
        body: JSON.stringify({ path: 'documents/member-b/report.pdf' }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signedUrl: 'https://storage.example/signed-object',
    });
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      'ws-123',
      'documents/member-b/report.pdf',
      expect.any(Object)
    );
  });
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));
