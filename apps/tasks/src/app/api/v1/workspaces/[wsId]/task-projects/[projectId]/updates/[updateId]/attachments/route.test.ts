import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  const rows: Record<string, unknown> = {
    task_project_update_attachments: { id: 'attachment-1' },
    task_project_updates: { id: 'update-1', project_id: 'project-1' },
    task_projects: { ws_id: 'ws-1' },
  };
  const query = (table: string) => {
    const chain = {
      eq: () => chain,
      insert: () => chain,
      select: () => chain,
      single: async () => ({ data: rows[table], error: null }),
    };
    return chain;
  };
  const supabase = {
    from: (table: string) => query(table),
    storage: {
      from: () => ({
        createSignedUrl,
        remove: vi.fn(),
        upload: async (path: string) => ({ data: { path }, error: null }),
      }),
    },
  };

  return { createSignedUrl, supabase };
});

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    authError: null,
    supabase: mocks.supabase,
    user: { id: 'user-1' },
  }),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true, type: 'MEMBER' }),
}));

describe('POST project update attachment', () => {
  beforeEach(() => {
    mocks.createSignedUrl.mockReset();
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed' },
      error: null,
    });
  });

  it('returns a signed preview link that lasts at most 15 minutes', async () => {
    const { POST } = await import('./route');
    const body = new FormData();
    body.append(
      'file',
      new File(['hello'], 'notes.txt', { type: 'text/plain' })
    );

    const response = await POST(
      new NextRequest(
        'https://tasks.tuturuuu.com/api/v1/workspaces/ws-1/task-projects/project-1/updates/update-1/attachments',
        { body, method: 'POST' }
      ),
      {
        params: Promise.resolve({
          projectId: 'project-1',
          updateId: 'update-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(201);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    const [path, expiresIn] = mocks.createSignedUrl.mock.calls[0] ?? [];
    expect(path).toMatch(/^ws-1\/project-updates\/update-1\/[^/]+$/u);
    expect(expiresIn).toBeLessThanOrEqual(15 * 60);
    await expect(response.json()).resolves.toMatchObject({
      signedUrl: 'https://storage.example/signed',
    });
  });
});
