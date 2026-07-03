import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMocks, logDrainMocks } = vi.hoisted(() => ({
  accessMocks: {
    ensureWorkspaceExternalProjectStudio: vi.fn(),
    requireWorkspaceExternalProjectSetupAccess: vi.fn(),
  },
  logDrainMocks: {
    serverLogger: {
      error: vi.fn(),
    },
    withRequestLogDrain: vi.fn((_metadata, handler) => handler()),
  },
}));

vi.mock('@/lib/external-projects/access', () => accessMocks);

vi.mock('@/lib/infrastructure/log-drain', () => logDrainMocks);

import { POST } from './route';

describe('external project setup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires manage access before auto-setting up a workspace', async () => {
    accessMocks.requireWorkspaceExternalProjectSetupAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws_123/external-projects/setup',
        {
          body: JSON.stringify({ adapter: 'yashie' }),
          method: 'POST',
        }
      ) as never,
      { params: Promise.resolve({ wsId: 'ws_123' }) }
    );

    expect(response.status).toBe(403);
    expect(
      accessMocks.ensureWorkspaceExternalProjectStudio
    ).not.toHaveBeenCalled();
  });

  it('derives adapter and schema from the submitted manifest', async () => {
    accessMocks.requireWorkspaceExternalProjectSetupAccess.mockResolvedValue({
      admin: { from: vi.fn() },
      normalizedWorkspaceId: 'ws_123',
      ok: true,
      user: { id: 'user_123' },
    });
    accessMocks.ensureWorkspaceExternalProjectStudio.mockResolvedValue({
      binding: {
        adapter: 'yashie',
        canonical_id: 'yashie-main',
        canonical_project: null,
        enabled: true,
        workspace_id: 'ws_123',
      },
      createdBinding: true,
      createdCanonicalProject: true,
    });

    const manifest = {
      adapter: 'yashie',
      content: {
        entries: [],
      },
      schema: {
        collections: [
          {
            collection_type: 'gallery',
            slug: 'gallery',
            title: 'Gallery',
          },
        ],
      },
      version: 1,
    } as const;

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws_123/external-projects/setup',
        {
          body: JSON.stringify({ manifest }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
      ) as never,
      { params: Promise.resolve({ wsId: 'ws_123' }) }
    );

    expect(response.status).toBe(200);
    expect(
      accessMocks.ensureWorkspaceExternalProjectStudio
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user_123',
        adapter: 'yashie',
        schema: manifest.schema,
        workspaceId: 'ws_123',
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      autoSetup: true,
      createdBinding: true,
      createdCanonicalProject: true,
    });
  });
});
