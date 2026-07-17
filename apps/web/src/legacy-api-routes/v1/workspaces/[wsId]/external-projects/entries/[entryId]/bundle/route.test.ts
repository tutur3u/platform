import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireWorkspaceExternalProjectAccess: vi.fn(),
  upsertWorkspaceExternalProjectEntryBundle: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/store-relations', () => ({
  upsertWorkspaceExternalProjectEntryBundle: (
    ...args: Parameters<typeof mocks.upsertWorkspaceExternalProjectEntryBundle>
  ) => mocks.upsertWorkspaceExternalProjectEntryBundle(...args),
}));

const entryId = '00000000-0000-4000-8000-000000000001';

function createRequest(expectedUpdatedAt: string) {
  return new Request(
    `http://localhost/api/v1/workspaces/personal/external-projects/entries/${entryId}/bundle`,
    {
      body: JSON.stringify({
        blocks: [],
        entry: {},
        expectedUpdatedAt,
        relations: [],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

describe('external project entry bundle route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: { role: 'admin-client' },
      normalizedWorkspaceId: 'ws-normalized',
      ok: true,
      user: {
        id: 'user-1',
      },
    });
    mocks.upsertWorkspaceExternalProjectEntryBundle.mockResolvedValue({
      blocks: [],
      entry: { id: entryId },
      relations: [],
    });
  });

  it('preserves offset timestamps and database microseconds for concurrency', async () => {
    const expectedUpdatedAt = '2026-07-12T23:20:06.973736+00:00';
    const { PUT } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/entries/[entryId]/bundle/route'
    );

    const response = await PUT(createRequest(expectedUpdatedAt), {
      params: Promise.resolve({
        entryId,
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(200);
    expect(
      mocks.upsertWorkspaceExternalProjectEntryBundle
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId,
        expectedUpdatedAt,
        workspaceId: 'ws-normalized',
      }),
      { role: 'admin-client' }
    );
  });

  it('rejects malformed concurrency timestamps', async () => {
    const { PUT } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/entries/[entryId]/bundle/route'
    );

    const response = await PUT(createRequest('not-a-timestamp'), {
      params: Promise.resolve({
        entryId,
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(400);
    expect(
      mocks.upsertWorkspaceExternalProjectEntryBundle
    ).not.toHaveBeenCalled();
  });
});
