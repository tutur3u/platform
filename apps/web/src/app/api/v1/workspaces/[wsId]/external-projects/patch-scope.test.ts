import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceExternalProjectCollection: vi.fn(),
  deleteWorkspaceExternalProjectEntry: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  updateWorkspaceExternalProjectBlock: vi.fn(),
  updateWorkspaceExternalProjectCollection: vi.fn(),
  updateWorkspaceExternalProjectEntry: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  deleteWorkspaceExternalProjectCollection: (
    ...args: Parameters<typeof mocks.deleteWorkspaceExternalProjectCollection>
  ) => mocks.deleteWorkspaceExternalProjectCollection(...args),
  deleteWorkspaceExternalProjectEntry: (
    ...args: Parameters<typeof mocks.deleteWorkspaceExternalProjectEntry>
  ) => mocks.deleteWorkspaceExternalProjectEntry(...args),
  updateWorkspaceExternalProjectBlock: (
    ...args: Parameters<typeof mocks.updateWorkspaceExternalProjectBlock>
  ) => mocks.updateWorkspaceExternalProjectBlock(...args),
  updateWorkspaceExternalProjectCollection: (
    ...args: Parameters<typeof mocks.updateWorkspaceExternalProjectCollection>
  ) => mocks.updateWorkspaceExternalProjectCollection(...args),
  updateWorkspaceExternalProjectEntry: (
    ...args: Parameters<typeof mocks.updateWorkspaceExternalProjectEntry>
  ) => mocks.updateWorkspaceExternalProjectEntry(...args),
}));

describe('external project PATCH route workspace scoping', () => {
  const access = {
    admin: { role: 'admin-client' },
    normalizedWorkspaceId: 'ws-normalized',
    ok: true,
    user: {
      id: 'user-1',
    },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue(access);
  });

  it('passes the authorized workspace to collection updates', async () => {
    mocks.updateWorkspaceExternalProjectCollection.mockResolvedValue({
      id: 'collection-1',
    });
    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/collections/[collectionId]/route'
    );

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/personal/external-projects/collections/collection-1',
        {
          body: JSON.stringify({
            title: 'Updated collection',
          }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          collectionId: 'collection-1',
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceExternalProjectCollection).toHaveBeenCalledWith(
      'collection-1',
      expect.objectContaining({
        actorId: 'user-1',
        title: 'Updated collection',
        workspaceId: 'ws-normalized',
      }),
      access.admin
    );
  });

  it('passes the authorized workspace to block updates', async () => {
    mocks.updateWorkspaceExternalProjectBlock.mockResolvedValue({
      id: 'block-1',
    });
    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/blocks/[blockId]/route'
    );

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/personal/external-projects/blocks/block-1',
        {
          body: JSON.stringify({
            title: 'Updated block',
          }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          blockId: 'block-1',
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceExternalProjectBlock).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({
        actorId: 'user-1',
        title: 'Updated block',
        workspaceId: 'ws-normalized',
      }),
      access.admin
    );
  });

  it('passes the authorized workspace to entry updates', async () => {
    mocks.updateWorkspaceExternalProjectEntry.mockResolvedValue({
      id: 'entry-1',
    });
    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/entries/[entryId]/route'
    );

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/personal/external-projects/entries/entry-1',
        {
          body: JSON.stringify({
            title: 'Updated entry',
          }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          entryId: 'entry-1',
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceExternalProjectEntry).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        actorId: 'user-1',
        title: 'Updated entry',
        workspaceId: 'ws-normalized',
      }),
      access.admin
    );
  });
});
