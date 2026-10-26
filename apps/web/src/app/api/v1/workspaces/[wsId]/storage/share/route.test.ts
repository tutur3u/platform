import { resolveStoredWorkspaceStorageUrl } from '@tuturuuu/storage-core/signed-url-policy';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVATE_DRIVE_RESOURCE_PATHS } from '@/lib/private-drive-paths.test-fixture';
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
    expect(response.headers.get('cache-control')).toBe('private, no-store');
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

  it.each(PRIVATE_DRIVE_RESOURCE_PATHS)(
    'denies GET and POST sharing of %s',
    async (path) => {
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
    }
  );

  it.each(['documents/member-b/report.pdf', 'mira/notes.txt'])(
    'keeps own Drive file %s shareable',
    async (path) => {
      const response = await POST(
        new Request('http://localhost/api/v1/workspaces/ws-123/storage/share', {
          method: 'POST',
          body: JSON.stringify({ path }),
        }),
        params
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        signedUrl: 'https://storage.example/signed-object',
      });
      expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
        'ws-123',
        path,
        expect.objectContaining({ expiresIn: 3600 })
      );
    }
  );

  it.each([
    ['clamps a one-year request to seven days', 31_536_000, 604_800],
    ['keeps an explicit lifetime under the cap', 7200, 7200],
    ['keeps exactly seven days', 604_800, 604_800],
  ])('%s', async (_, expiresIn, expected) => {
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-123/storage/share', {
        method: 'POST',
        body: JSON.stringify({ path: 'mira/notes.txt', expiresIn }),
      }),
      params
    );
    expect(response.status).toBe(200);
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenLastCalledWith(
      'ws-123',
      'mira/notes.txt',
      expect.objectContaining({ expiresIn: expected })
    );
  });

  it('clamps GET redirect lifetimes too', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-123/storage/share?path=mira%2Fnotes.txt&expiresIn=31536000'
      ),
      params
    );
    expect(response.status).toBe(307);
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenLastCalledWith(
      'ws-123',
      'mira/notes.txt',
      expect.objectContaining({ expiresIn: 604_800 })
    );
  });
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

// Documents rewrite stored signed image URLs to this redirect; following one
// must re-check the reader's access, not trust the old token.
describe('rewritten document image links', () => {
  const wsId = '11111111-1111-4111-8111-111111111111';
  const link = resolveStoredWorkspaceStorageUrl(
    `https://project.supabase.co/storage/v1/object/sign/workspaces/${wsId}/documents/1-a.png?token=one-year-token`
  );
  const linkRequest = () => new Request(`http://localhost${link}`);
  const linkParams = { params: Promise.resolve({ wsId }) };
  const actor = (withoutPermission: (permission: string) => boolean) => ({
    ok: true,
    context: {
      normalizedWsId: wsId,
      permissions: { withoutPermission },
      supabase: {},
      userId: 'reader',
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example/fresh-document-image'
    );
  });

  it('points at the share redirect without the stored token', () => {
    expect(link).toBe(
      `/api/v1/workspaces/${wsId}/storage/share?path=documents%2F1-a.png`
    );
  });

  it('returns 403 to a member without Drive access', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue(
      actor((permission) => permission === 'view_drive')
    );

    const response = await GET(linkRequest(), linkParams);

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('returns 403 to an actor the workspace auth rejects', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await GET(linkRequest(), linkParams);

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('re-signs for an authorised reader with an uncached one-hour URL', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue(
      actor(() => false)
    );

    const response = await GET(linkRequest(), linkParams);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://storage.example/fresh-document-image'
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      wsId,
      'documents/1-a.png',
      expect.objectContaining({ expiresIn: 3600 })
    );
  });
});
