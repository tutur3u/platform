import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DELETE,
  registerOrphanedWorkspaceCleanup,
  type OrphanedWorkspaceCleanup,
} from './route';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'ws-a',
  getPermissions: async () => ({ withoutPermission: () => false }),
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(),
}));

const creator = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const member = 'fedcbafe-dcba-4fed-8cba-fedcbafedcba';
const directCleanup: OrphanedWorkspaceCleanup = {
  resume: async () => {},
  deleteWorkspace: async (_wsId, remove) => {
    const removed = await remove();
    if (removed.error) throw removed.error;
  },
};

function adminClient(options: { workspaceMissingOnCleanup: boolean }) {
  const writes: string[] = [];
  const from = vi.fn((table: string) => {
    let rows: Array<Record<string, unknown>> = [];
    if (table === 'workspaces') {
      const missing = options.workspaceMissingOnCleanup;
      rows = missing
        ? []
        : [{ id: 'ws-a', creator_id: creator, personal: false }];
    }
    const query = {
      select: () => query,
      delete: () => {
        writes.push(table);
        return query;
      },
      eq: () => query,
      in: () => query,
      ilike: () => query,
      neq: () => query,
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (
        resolve: (value: {
          data: Array<Record<string, unknown>>;
          error: null;
          count: number;
        }) => unknown
      ) =>
        Promise.resolve(
          resolve({ data: rows, error: null, count: rows.length })
        ),
    };
    return query;
  });
  const rpc = vi.fn().mockResolvedValue({ data: 'removed', error: null });
  return { from, rpc, writes };
}

function removeMember() {
  return DELETE(
    new NextRequest(`https://example.invalid/members?id=${member}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ wsId: 'ws-a' }) },
    { supabase: {} as never, user: { id: 'actor' } }
  );
}

describe('orphaned workspace cleanup', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    registerOrphanedWorkspaceCleanup(directCleanup);
  });

  afterEach(() => {
    registerOrphanedWorkspaceCleanup(directCleanup);
    vi.restoreAllMocks();
  });

  it('deletes an orphaned workspace through the registered cleanup', async () => {
    const admin = adminClient({ workspaceMissingOnCleanup: false });
    mocks.admin.mockResolvedValue(admin);
    const calls: string[] = [];
    registerOrphanedWorkspaceCleanup({
      resume: async (wsId) => {
        calls.push(`resume:${wsId}`);
      },
      deleteWorkspace: async (wsId, remove) => {
        calls.push(`delete:${wsId}`);
        const removed = await remove();
        if (removed.error) throw removed.error;
      },
    });

    const response = await removeMember();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workspace_deleted: true });
    expect(calls).toEqual(['delete:ws-a']);
    expect(admin.writes).toContain('workspaces');
  });

  it('resumes erasure when the workspace row is already gone', async () => {
    const admin = adminClient({ workspaceMissingOnCleanup: true });
    mocks.admin.mockResolvedValue(admin);
    const calls: string[] = [];
    registerOrphanedWorkspaceCleanup({
      resume: async (wsId) => {
        calls.push(`resume:${wsId}`);
      },
      deleteWorkspace: async () => {
        calls.push('delete');
      },
    });

    const response = await removeMember();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workspace_deleted: false });
    expect(calls).toEqual(['resume:ws-a']);
    expect(admin.writes).not.toContain('workspaces');
  });

  it('keeps the workspace when the registered delete fails', async () => {
    const admin = adminClient({ workspaceMissingOnCleanup: false });
    mocks.admin.mockResolvedValue(admin);
    registerOrphanedWorkspaceCleanup({
      resume: async () => {},
      deleteWorkspace: async () => {
        throw new Error('erase failed');
      },
    });

    const response = await removeMember();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workspace_deleted: false });
    expect(admin.writes).not.toContain('workspaces');
  });
});
