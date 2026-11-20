import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  provider: vi.fn(),
  list: vi.fn(),
  move: vi.fn(),
}));

vi.mock('@/legacy-api-routes/v1/workspaces/[wsId]/storage/route-auth', () => ({
  resolveWorkspaceStorageRouteAuth: mocks.auth,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  resolveWorkspaceStorageProvider: mocks.provider,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => ({
    storage: { from: () => ({ list: mocks.list, move: mocks.move }) },
  }),
}));
vi.mock('server-only', () => ({}));

import { POST } from './route';

const wsId = 'workspace-a';
const payload = {
  source: { workspaceId: wsId, path: '' },
  destination: { workspaceId: wsId, path: 'Archive' },
  entries: [{ name: 'Report.pdf', isFolder: false }],
};
const file = (name: string, size: unknown = 1) => ({
  name,
  id: name,
  metadata: { size },
});

function post(body: unknown = payload) {
  return POST(
    new Request('https://example.test/api/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId }) }
  );
}

describe('workspace Drive move', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: wsId,
        permissions: { withoutPermission: () => false },
      },
    });
    mocks.provider.mockResolvedValue({
      provider: 'supabase',
      misconfigured: false,
    });
    mocks.move.mockResolvedValue({ error: null });
    mocks.list.mockImplementation(async (path: string) => ({
      error: null,
      data: path === wsId ? [file('Report.pdf')] : [file('Existing.txt')],
    }));
  });

  it('requires auth and manage_drive before touching storage', async () => {
    mocks.auth.mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    expect((await post()).status).toBe(401);
    const withoutPermission = vi.fn(() => true);
    mocks.auth.mockResolvedValueOnce({
      ok: true,
      context: { normalizedWsId: wsId, permissions: { withoutPermission } },
    });
    expect((await post()).status).toBe(403);
    expect(withoutPermission).toHaveBeenCalledWith('manage_drive');
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it.each(['source', 'destination'] as const)(
    'rejects a foreign %s workspace',
    async (field) => {
      const response = await post({
        ...payload,
        [field]: { ...payload[field], workspaceId: 'workspace-b' },
      });
      expect(response.status).toBe(403);
      expect(mocks.provider).not.toHaveBeenCalled();
    }
  );

  it.each(['Reports', 'Reports/2026'])(
    'rejects moving a folder into %s',
    async (path) => {
      const response = await post({
        ...payload,
        destination: { workspaceId: wsId, path },
        entries: [{ name: 'Reports', isFolder: true }],
      });
      expect(response.status).toBe(400);
      expect(mocks.provider).not.toHaveBeenCalled();
    }
  );

  it.each([
    '../workspace-b',
    'Archive/%2e%2e',
    '.tuturuuu/inbox',
    'mira/images',
  ])('rejects forbidden destination %s before storage access', async (path) => {
    const response = await post({
      ...payload,
      destination: { workspaceId: wsId, path },
    });
    expect([400, 403]).toContain(response.status);
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it('checks all names before writing any entry', async () => {
    mocks.list.mockImplementation(async (path: string) => ({
      error: null,
      data:
        path === wsId
          ? [file('Report.pdf'), file('Conflict.pdf')]
          : [file('Conflict.pdf')],
    }));
    expect(
      (
        await post({
          ...payload,
          entries: [
            ...payload.entries,
            { name: 'Conflict.pdf', isFolder: false },
          ],
        })
      ).status
    ).toBe(409);
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('keeps folder markers and reports a stopped folder move without retrying', async () => {
    mocks.list.mockImplementation(async (path: string) => ({
      error: null,
      data:
        path === wsId
          ? [{ name: 'Reports', id: null }, file('Report.pdf')]
          : path === `${wsId}/Reports`
            ? [file('.emptyFolderPlaceholder'), file('Project.pdf')]
            : [file('Existing.txt')],
    }));
    mocks.move
      .mockResolvedValueOnce({ error: null })
      .mockRejectedValueOnce(new Error('connection closed'));
    const response = await post({
      ...payload,
      entries: [{ name: 'Reports', isFolder: true }, ...payload.entries],
    });
    expect(await response.json()).toEqual({
      data: [
        {
          name: 'Reports',
          status: 'uncertain',
          totalFiles: 1,
          movedFiles: 0,
          movedMarkers: 1,
        },
        {
          name: 'Report.pdf',
          status: 'skipped',
          totalFiles: 1,
          movedFiles: 0,
          movedMarkers: 0,
        },
      ],
    });
    expect(mocks.move).toHaveBeenCalledTimes(2);
    expect(mocks.move).toHaveBeenNthCalledWith(
      1,
      `${wsId}/Reports/.emptyFolderPlaceholder`,
      `${wsId}/Archive/Reports/.emptyFolderPlaceholder`
    );
  });

  it('rejects a large batch before listing', async () => {
    const entries = Array.from({ length: 21 }, (_, index) => ({
      name: `File ${index}`,
      isFolder: false,
    }));
    expect((await post({ ...payload, entries })).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('rejects a folder that exceeds the object bound before making writes', async () => {
    mocks.list.mockImplementation(async (path: string) => ({
      error: null,
      data:
        path === wsId
          ? [{ name: 'Reports', id: null }]
          : path === `${wsId}/Reports`
            ? Array.from({ length: 65 }, (_, index) => file(`File ${index}`))
            : [file('Existing.txt')],
    }));
    const response = await post({
      ...payload,
      entries: [{ name: 'Reports', isFolder: true }],
    });
    expect(response.status).toBe(413);
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('rejects a batch over the byte budget before making writes', async () => {
    mocks.list.mockImplementation(async (path: string) => ({
      error: null,
      data:
        path === wsId
          ? [file('Report.pdf', 2 * 1024 ** 3), file('Next.pdf', 1)]
          : [file('Existing.txt')],
    }));
    const response = await post({
      ...payload,
      entries: [...payload.entries, { name: 'Next.pdf', isFolder: false }],
    });
    expect(response.status).toBe(413);
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it.each([null, -1, 1.5, '5', Number.POSITIVE_INFINITY])(
    'rejects unavailable or invalid size %s before writing',
    async (size) => {
      mocks.list.mockImplementation(async (path: string) => ({
        error: null,
        data:
          path === wsId ? [file('Report.pdf', size)] : [file('Existing.txt')],
      }));
      const response = await post();
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'DRIVE_MOVE_SIZE' });
      expect(mocks.move).not.toHaveBeenCalled();
    }
  );

  it('stops when a destination folder appears after preflight', async () => {
    let lookups = 0;
    mocks.list.mockImplementation(
      async (path: string, { search }: { search?: string }) => ({
        error: null,
        data:
          path === wsId
            ? [{ name: 'Reports', id: null }]
            : path === `${wsId}/Reports`
              ? [file('Project.pdf')]
              : path === `${wsId}/Archive` &&
                  search === 'Reports' &&
                  ++lookups === 2
                ? [{ name: 'Reports', id: null }]
                : [file('Existing.txt')],
      })
    );
    const response = await post({
      ...payload,
      entries: [{ name: 'Reports', isFolder: true }],
    });
    expect(await response.json()).toEqual({
      data: [
        {
          name: 'Reports',
          status: 'conflict',
          totalFiles: 1,
          movedFiles: 0,
          movedMarkers: 0,
        },
      ],
    });
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('stops before moving a file whose destination appears during a folder move', async () => {
    mocks.list.mockImplementation(async (path: string) => ({
      error: null,
      data:
        path === wsId
          ? [{ name: 'Reports', id: null }]
          : path === `${wsId}/Reports`
            ? [file('First.pdf'), file('Second.pdf')]
            : path === `${wsId}/Archive/Reports` &&
                mocks.move.mock.calls.length > 0
              ? [file('Second.pdf')]
              : [file('Existing.txt')],
    }));
    const response = await post({
      ...payload,
      entries: [{ name: 'Reports', isFolder: true }],
    });
    expect(await response.json()).toEqual({
      data: [
        {
          name: 'Reports',
          status: 'conflict',
          totalFiles: 2,
          movedFiles: 1,
          movedMarkers: 0,
        },
      ],
    });
    expect(mocks.move).toHaveBeenCalledTimes(1);
  });

  it('fails closed for the R2 storage provider', async () => {
    mocks.provider.mockResolvedValueOnce({
      provider: 'r2',
      misconfigured: false,
    });
    expect((await post()).status).toBe(409);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('uses workspace-prefixed object keys and reports success', async () => {
    const response = await post();
    expect(await response.json()).toEqual({
      data: [
        {
          name: 'Report.pdf',
          status: 'moved',
          totalFiles: 1,
          movedFiles: 1,
          movedMarkers: 0,
        },
      ],
    });
    expect(mocks.move).toHaveBeenCalledWith(
      `${wsId}/Report.pdf`,
      `${wsId}/Archive/Report.pdf`
    );
  });
});
