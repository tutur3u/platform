import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTulearnSubject, TulearnAccessError } from './access';
import { ENABLE_EDUCATION_SECRET } from './constants';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (wsId: string) => wsId,
}));

type Row = Record<string, unknown>;

function createAdmin(tables: Record<string, Row[]>) {
  return {
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const query = {
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        limit: () => query,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        order: () => query,
        select: () => query,
      };
      return query;
    },
  };
}

const link = (status: string): Row => ({
  parent_user_id: 'parent',
  status,
  student_platform_user_id: 'student-platform',
  student_workspace_user_id: 'student-ws',
  ws_id: 'ws-1',
});

function resolveAsParent(linkStatus: string) {
  mocks.createAdminClient.mockResolvedValue(
    createAdmin({
      tulearn_parent_student_links: [link(linkStatus)],
      workspace_secrets: [
        { name: ENABLE_EDUCATION_SECRET, value: 'true', ws_id: 'ws-1' },
      ],
      workspace_users: [
        { display_name: 'Learner', id: 'student-ws', ws_id: 'ws-1' },
      ],
    })
  );

  return resolveTulearnSubject({
    requestSupabase: {} as never,
    studentId: 'student-ws',
    user: { id: 'parent' } as SupabaseUser,
    wsId: 'ws-1',
  });
}

describe('parent link consent in learner access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants read-only parent access only for an active link', async () => {
    await expect(resolveAsParent('active')).resolves.toMatchObject({
      readOnly: true,
      role: 'parent',
      studentPlatformUserId: 'student-platform',
      studentWorkspaceUserId: 'student-ws',
    });
  });

  it.each(['pending', 'revoked'])('denies a %s link', async (status) => {
    const result = resolveAsParent(status);

    await expect(result).rejects.toBeInstanceOf(TulearnAccessError);
    await expect(result).rejects.toMatchObject({ status: 403 });
  });
});
