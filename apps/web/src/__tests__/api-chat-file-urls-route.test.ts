import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const membershipMaybeSingle = vi.fn();
  const list = vi.fn();
  const createSignedUrls = vi.fn();
  const normalizeWorkspaceId = vi.fn();

  const sessionSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: membershipMaybeSingle,
          })),
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        list: vi.fn(() => {
          throw new Error('session storage client should not be used');
        }),
      })),
    },
  };

  const adminSupabase = {
    storage: {
      from: vi.fn(() => ({
        list,
        createSignedUrls,
      })),
    },
  };

  return {
    adminSupabase,
    createSignedUrls,
    list,
    membershipMaybeSingle,
    normalizeWorkspaceId,
    sessionSupabase,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

type FileUrlsRouteHandler = (
  request: NextRequest,
  context: {
    user: { id: string };
    supabase: typeof mocks.sessionSupabase;
  }
) => Promise<Response>;

describe('chat file-urls route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.membershipMaybeSingle.mockReset();
    mocks.list.mockReset();
    mocks.createSignedUrls.mockReset();
    mocks.normalizeWorkspaceId.mockReset();
    mocks.sessionSupabase.from.mockClear();
    mocks.sessionSupabase.storage.from.mockClear();
    mocks.adminSupabase.storage.from.mockClear();
  });

  it('lists chat files with the admin storage client after membership passes', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    });
    mocks.list.mockResolvedValue({
      data: [
        {
          id: 'file-1',
          name: '1712345678_report.pdf',
          metadata: { size: 1234 },
          created_at: '2026-03-13T01:00:00.000Z',
        },
        {
          id: null,
          name: '.emptyFolderPlaceholder',
          metadata: null,
          created_at: null,
        },
      ],
      error: null,
    });
    mocks.createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: 'https://signed.example/report.pdf' }],
      error: null,
    });

    const { POST } = await import('@/app/api/ai/chat/file-urls/route');
    const response = await (POST as FileUrlsRouteHandler)(
      new NextRequest('http://localhost/api/ai/chat/file-urls', {
        method: 'POST',
        body: JSON.stringify({
          wsId: 'personal',
          chatId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      {
        user: { id: 'user-1' },
        supabase: mocks.sessionSupabase,
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      files: [
        {
          createdAt: '2026-03-13T01:00:00.000Z',
          name: 'report.pdf',
          path: '00000000-0000-0000-0000-000000000001/chats/ai/resources/11111111-1111-4111-8111-111111111111/1712345678_report.pdf',
          signedUrl: 'https://signed.example/report.pdf',
          size: 1234,
          type: 'application/pdf',
        },
      ],
    });

    expect(mocks.sessionSupabase.storage.from).not.toHaveBeenCalled();
    expect(mocks.adminSupabase.storage.from).toHaveBeenCalledWith('workspaces');
    expect(mocks.list).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001/chats/ai/resources/11111111-1111-4111-8111-111111111111',
      {
        limit: 50,
        sortBy: { column: 'created_at', order: 'asc' },
      }
    );
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(
      [
        '00000000-0000-0000-0000-000000000001/chats/ai/resources/11111111-1111-4111-8111-111111111111/1712345678_report.pdf',
      ],
      3600
    );
  });

  it('returns 500 when admin storage listing fails', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    });
    mocks.list.mockResolvedValue({
      data: null,
      error: {
        message: 'new row violates row-level security policy',
        statusCode: '403',
      },
    });

    const { POST } = await import('@/app/api/ai/chat/file-urls/route');
    const response = await (POST as FileUrlsRouteHandler)(
      new NextRequest('http://localhost/api/ai/chat/file-urls', {
        method: 'POST',
        body: JSON.stringify({
          wsId: 'personal',
          chatId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      {
        user: { id: 'user-1' },
        supabase: mocks.sessionSupabase,
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Failed to list files',
    });
    expect(mocks.sessionSupabase.storage.from).not.toHaveBeenCalled();
  });
});
