import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceExternalProjectEntry: vi.fn(),
  deleteWorkspaceExternalProjectEntry: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  updateWorkspaceExternalProjectEntry: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  createWorkspaceExternalProjectEntry: (
    ...args: Parameters<typeof mocks.createWorkspaceExternalProjectEntry>
  ) => mocks.createWorkspaceExternalProjectEntry(...args),
  deleteWorkspaceExternalProjectEntry: (
    ...args: Parameters<typeof mocks.deleteWorkspaceExternalProjectEntry>
  ) => mocks.deleteWorkspaceExternalProjectEntry(...args),
  updateWorkspaceExternalProjectEntry: (
    ...args: Parameters<typeof mocks.updateWorkspaceExternalProjectEntry>
  ) => mocks.updateWorkspaceExternalProjectEntry(...args),
}));

const collectionId = '00000000-0000-4000-8000-000000000001';
const entryId = '00000000-0000-4000-8000-000000000002';
const deletedEntryId = '00000000-0000-4000-8000-000000000003';

function createRequest(body: unknown) {
  return new Request(
    'http://localhost/api/v1/workspaces/personal/external-projects/entries/batch',
    {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

describe('external project entry batch route', () => {
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
  });

  it('requires manage access before mutating entries', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
      }),
    });
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/entries/batch/route'
    );

    const response = await POST(createRequest({ operations: [] }), {
      params: Promise.resolve({
        wsId: 'personal',
      }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceExternalProjectEntry).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceExternalProjectEntry).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspaceExternalProjectEntry).not.toHaveBeenCalled();
  });

  it('processes mixed create, update, and delete operations in order', async () => {
    mocks.createWorkspaceExternalProjectEntry.mockResolvedValue({
      id: 'created-entry',
      slug: 'created',
      title: 'Created',
    });
    mocks.updateWorkspaceExternalProjectEntry.mockResolvedValue({
      id: entryId,
      slug: 'updated',
      title: 'Updated',
    });
    mocks.deleteWorkspaceExternalProjectEntry.mockResolvedValue({
      id: deletedEntryId,
    });
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/entries/batch/route'
    );

    const response = await POST(
      createRequest({
        operations: [
          {
            action: 'create',
            clientOperationId: 'create-profile',
            payload: {
              collection_id: collectionId,
              metadata: {},
              profile_data: {},
              slug: 'created',
              status: 'published',
              title: 'Created',
            },
          },
          {
            action: 'update',
            clientOperationId: 'update-profile',
            entryId,
            payload: {
              title: 'Updated',
            },
          },
          {
            action: 'delete',
            clientOperationId: 'delete-social',
            entryId: deletedEntryId,
          },
        ],
      }),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'manage',
      request: expect.any(Request),
      wsId: 'personal',
    });
    expect(mocks.createWorkspaceExternalProjectEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        collection_id: collectionId,
        slug: 'created',
        workspaceId: 'ws-normalized',
      }),
      { role: 'admin-client' }
    );
    expect(mocks.updateWorkspaceExternalProjectEntry).toHaveBeenCalledWith(
      entryId,
      expect.objectContaining({
        actorId: 'user-1',
        title: 'Updated',
        workspaceId: 'ws-normalized',
      }),
      { role: 'admin-client' }
    );
    expect(mocks.deleteWorkspaceExternalProjectEntry).toHaveBeenCalledWith(
      deletedEntryId,
      {
        workspaceId: 'ws-normalized',
      },
      { role: 'admin-client' }
    );
    expect(payload.results).toEqual([
      expect.objectContaining({
        action: 'create',
        clientOperationId: 'create-profile',
        ok: true,
      }),
      expect.objectContaining({
        action: 'update',
        clientOperationId: 'update-profile',
        ok: true,
      }),
      expect.objectContaining({
        action: 'delete',
        clientOperationId: 'delete-social',
        entryId: deletedEntryId,
        ok: true,
      }),
    ]);
  });

  it('keeps processing after per-operation failures', async () => {
    mocks.updateWorkspaceExternalProjectEntry.mockRejectedValueOnce(
      new Error('Update failed')
    );
    mocks.deleteWorkspaceExternalProjectEntry.mockResolvedValueOnce({
      id: deletedEntryId,
    });
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/entries/batch/route'
    );

    const response = await POST(
      createRequest({
        operations: [
          {
            action: 'update',
            clientOperationId: 'update-broken',
            entryId,
            payload: {
              title: 'Updated',
            },
          },
          {
            action: 'delete',
            clientOperationId: 'delete-social',
            entryId: deletedEntryId,
          },
        ],
      }),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.deleteWorkspaceExternalProjectEntry).toHaveBeenCalledTimes(1);
    expect(payload.results).toEqual([
      {
        action: 'update',
        clientOperationId: 'update-broken',
        error: 'Update failed',
        ok: false,
      },
      {
        action: 'delete',
        clientOperationId: 'delete-social',
        entryId: deletedEntryId,
        ok: true,
      },
    ]);
  });

  it('rejects invalid payloads', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/entries/batch/route'
    );

    const response = await POST(
      createRequest({
        operations: [
          {
            action: 'update',
            clientOperationId: 'update-broken',
            entryId: 'not-a-uuid',
            payload: {
              title: 'Updated',
            },
          },
        ],
      }),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(mocks.updateWorkspaceExternalProjectEntry).not.toHaveBeenCalled();
  });
});
