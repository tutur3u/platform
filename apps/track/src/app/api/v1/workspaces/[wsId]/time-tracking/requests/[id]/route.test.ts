import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminRemove: vi.fn(),
  createAdminClient: vi.fn(),
  createDynamicClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  primaryRemove: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  rpc: vi.fn(),
  sessionSupabase: {},
  single: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createDynamicClient: (
    ...args: Parameters<typeof mocks.createDynamicClient>
  ) => mocks.createDynamicClient(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
    ) => mocks.verifyWorkspaceMembershipType(...args),
  };
});

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

const REQUEST_ID = 'request-1';
const OLD_IMAGE = `${REQUEST_ID}/old.png`;
const NEW_IMAGE = `${REQUEST_ID}/new.png`;

function createStorageClient(remove: typeof mocks.primaryRemove) {
  return {
    storage: {
      from: vi.fn(() => ({ remove })),
    },
  };
}

function createAdminClient() {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: (...args: Parameters<typeof mocks.single>) => mocks.single(...args),
  };

  return {
    schema: vi.fn(() => ({
      from: vi.fn(() => query),
      rpc: (...args: Parameters<typeof mocks.rpc>) => mocks.rpc(...args),
    })),
    storage: {
      from: vi.fn(() => ({
        remove: (...args: Parameters<typeof mocks.adminRemove>) =>
          mocks.adminRemove(...args),
      })),
    },
  };
}

function createPutRequest(
  overrides: Partial<{
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    removedImages: string[];
    newImagePaths: string[];
  }> = {}
) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/ws-1/time-tracking/requests/${REQUEST_ID}`,
    {
      body: JSON.stringify({
        title: 'Corrected work entry',
        description: 'Updated details',
        startTime: '2026-08-10T01:00:00.000Z',
        endTime: '2026-08-10T02:00:00.000Z',
        removedImages: [OLD_IMAGE],
        newImagePaths: [NEW_IMAGE],
        ...overrides,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    }
  );
}

async function put(request = createPutRequest()) {
  const { PUT } = await import('./route');
  return PUT(request, {
    params: Promise.resolve({ id: REQUEST_ID, wsId: 'ws-1' }),
  });
}

describe('time tracking request image edit ordering', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: mocks.sessionSupabase,
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.single.mockResolvedValue({
      data: {
        approval_status: 'PENDING',
        id: REQUEST_ID,
        images: [OLD_IMAGE],
        user_id: 'user-1',
        workspace_id: 'ws-1',
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: { id: REQUEST_ID, images: [NEW_IMAGE] },
      error: null,
    });
    mocks.primaryRemove.mockResolvedValue({ error: null });
    mocks.adminRemove.mockResolvedValue({ error: null });
    mocks.createAdminClient.mockResolvedValue(createAdminClient());
    mocks.createDynamicClient.mockResolvedValue(
      createStorageClient(mocks.primaryRemove)
    );
  });

  it('preserves old images and cleans up only new uploads when the database update fails', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'update failed' },
    });

    const response = await put();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to update request',
    });
    expect(mocks.primaryRemove).toHaveBeenCalledOnce();
    expect(mocks.primaryRemove).toHaveBeenCalledWith([NEW_IMAGE]);
    expect(mocks.primaryRemove).not.toHaveBeenCalledWith([OLD_IMAGE]);
  });

  it('deletes old images only after the database update succeeds', async () => {
    const events: string[] = [];
    mocks.rpc.mockImplementation(async () => {
      events.push('database-update');
      return { data: { id: REQUEST_ID }, error: null };
    });
    mocks.primaryRemove.mockImplementation(async () => {
      events.push('storage-remove');
      return { error: null };
    });

    const response = await put();

    expect(response.status).toBe(200);
    expect(events).toEqual(['database-update', 'storage-remove']);
    expect(mocks.primaryRemove).toHaveBeenCalledWith([OLD_IMAGE]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'update_time_tracking_request_content',
      expect.objectContaining({ p_images: [NEW_IMAGE] })
    );
  });

  it('returns committed success and emits path-count telemetry when cleanup fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.primaryRemove.mockResolvedValue({ error: { message: 'denied' } });
    mocks.adminRemove.mockResolvedValue({ error: { message: 'unavailable' } });

    const response = await put();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to remove request images after content update:',
      { pathCount: 1, requestId: REQUEST_ID }
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(OLD_IMAGE);
    errorSpy.mockRestore();
  });

  it('preserves the admin fallback for post-commit image cleanup', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.primaryRemove.mockResolvedValue({ error: { message: 'denied' } });

    const response = await put();

    expect(response.status).toBe(200);
    expect(mocks.primaryRemove).toHaveBeenCalledWith([OLD_IMAGE]);
    expect(mocks.adminRemove).toHaveBeenCalledWith([OLD_IMAGE]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Removed request images via admin fallback cleanup:',
      { pathCount: 1, requestId: REQUEST_ID }
    );
    warnSpy.mockRestore();
  });

  it('does not call storage cleanup for an additions-only edit', async () => {
    const response = await put(
      createPutRequest({ removedImages: [], newImagePaths: [NEW_IMAGE] })
    );

    expect(response.status).toBe(200);
    expect(mocks.primaryRemove).not.toHaveBeenCalled();
    expect(mocks.adminRemove).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'update_time_tracking_request_content',
      expect.objectContaining({ p_images: [OLD_IMAGE, NEW_IMAGE] })
    );
  });

  it('rejects invalid image paths before updating the database', async () => {
    const response = await put(
      createPutRequest({ removedImages: ['another-request/image.png'] })
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.primaryRemove).not.toHaveBeenCalled();
  });

  it('returns the existing authentication response before reading the request', async () => {
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await put();

    expect(response.status).toBe(401);
    expect(mocks.single).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns not found without updating or deleting images', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { message: 'not found' },
    });

    const response = await put();

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.primaryRemove).not.toHaveBeenCalled();
  });
});
