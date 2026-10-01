import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTulearnSubject } from './access';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), normalize: vi.fn() }));
vi.mock('./db', () => ({ getAdmin: mocks.admin }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
}));
const wsId = 'workspace';
const user = { id: 'actor' } as SupabaseUser;
type Row = Record<string, unknown>;
function database({
  self = false,
  active = true,
  enabled = true,
  selected = 'child',
} = {}) {
  const filters: Array<[string, string, unknown]> = [];
  const db = {
    from(table: string) {
      const constraints = new Map<string, unknown>();
      const query = {
        select: (_columns: string) => query,
        eq: (column: string, value: unknown) => {
          constraints.set(column, value);
          filters.push([table, column, value]);
          return query;
        },
        order: (_column: string, _options: unknown) => query,
        limit: (_count: number) => query,
        async maybeSingle(): Promise<{ data: Row | null; error: null }> {
          if (table === 'workspace_secrets')
            return { data: { value: enabled ? 'true' : 'false' }, error: null };
          if (table === 'workspace_user_linked_users')
            return {
              data: self
                ? {
                    virtual_user_id: 'self',
                    workspace_users: {
                      id: 'self',
                      full_name: 'Self',
                      ws_id: wsId,
                    },
                  }
                : null,
              error: null,
            };
          if (table === 'tulearn_parent_student_links')
            return {
              data:
                active &&
                (!constraints.has('student_workspace_user_id') ||
                  constraints.get('student_workspace_user_id') === selected)
                  ? {
                      student_platform_user_id: 'child-platform',
                      student_workspace_user_id: selected,
                    }
                  : null,
              error: null,
            };
          if (table === 'workspace_users')
            return { data: { id: selected, full_name: 'Child' }, error: null };
          throw new Error(`Unexpected synthetic table ${table}`);
        },
      };
      return query;
    },
  };
  mocks.admin.mockResolvedValue(db);
  return filters;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.normalize.mockResolvedValue(wsId);
});
const subject = (studentId?: string) =>
  resolveTulearnSubject({
    requestSupabase: {} as never,
    wsId: 'alias',
    user,
    studentId,
  });
describe('Programming uses the real Tulearn subject resolver', () => {
  it('selects the linked self learner without querying parent links', async () => {
    const filters = database({ self: true });
    expect(await subject()).toMatchObject({
      role: 'student',
      readOnly: false,
      wsId,
      studentPlatformUserId: 'actor',
      studentWorkspaceUserId: 'self',
    });
    expect(
      filters.some(([table]) => table === 'tulearn_parent_student_links')
    ).toBe(false);
  });
  it('explicit learner selection remains parent read only even for a linked self learner', async () => {
    const filters = database({ self: true });
    expect(await subject('child')).toMatchObject({
      role: 'parent',
      readOnly: true,
      studentPlatformUserId: 'child-platform',
      studentWorkspaceUserId: 'child',
    });
    expect(filters).toContainEqual([
      'tulearn_parent_student_links',
      'parent_user_id',
      'actor',
    ]);
    expect(filters).toContainEqual([
      'tulearn_parent_student_links',
      'status',
      'active',
    ]);
    expect(filters).toContainEqual([
      'tulearn_parent_student_links',
      'ws_id',
      wsId,
    ]);
  });
  it('does not fall back to self or another child for an unauthorized selection', async () => {
    database({ self: true });
    await expect(subject('other')).rejects.toMatchObject({ status: 403 });
  });
  it('revoked parent links deny reads on the next request', async () => {
    database({ active: false });
    await expect(subject('child')).rejects.toMatchObject({ status: 403 });
  });
  it('disabled education denies both learner and parent scopes', async () => {
    database({ self: true, enabled: false });
    await expect(subject()).rejects.toMatchObject({ status: 404 });
  });
});
