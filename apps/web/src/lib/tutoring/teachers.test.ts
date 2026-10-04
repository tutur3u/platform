import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { listWorkspaceTeacherIds, workspaceTeachersQuery } from './teachers';

function fixture(data: { id: string }[] = [], error: unknown = null) {
  const query = {
    select: vi.fn((_columns: string, _options: unknown) => query),
    eq: vi.fn((_column: string, _value: string) => query),
    in: vi.fn(async () => ({ data, error })),
  };
  const client = { from: vi.fn(() => query) };
  return {
    client: client as unknown as TypedSupabaseClient,
    query,
    from: client.from,
  };
}

describe('workspace tutoring teacher eligibility', () => {
  it('requires actual TEACHER membership and scopes both user and group to the center', () => {
    const { client, query, from } = fixture();
    workspaceTeachersQuery(client, 'center');
    expect(from).toHaveBeenCalledWith('workspace_users');
    expect(query.select.mock.calls[0]?.[0]).toContain(
      '!inner(role,group:workspace_user_groups!'
    );
    expect(query.eq.mock.calls).toEqual([
      ['ws_id', 'center'],
      ['memberships.role', 'TEACHER'],
      ['memberships.group.ws_id', 'center'],
    ]);
    expect(query.eq).not.toHaveBeenCalledWith('group_id', expect.anything());
  });
  it('validates requested teachers across groups without returning other people', async () => {
    const { client, query } = fixture([{ id: 'eligible' }]);
    const result = await listWorkspaceTeacherIds({
      normalizedWsId: 'center',
      sbAdmin: client,
      teacherUserIds: ['eligible', 'student', 'other-center'],
    });
    expect(query.in).toHaveBeenCalledWith('id', [
      'eligible',
      'student',
      'other-center',
    ]);
    expect([...result.teacherIds]).toEqual(['eligible']);
  });
  it('fails closed on database errors', async () => {
    const { client } = fixture([], { message: 'unavailable' });
    const result = await listWorkspaceTeacherIds({
      normalizedWsId: 'center',
      sbAdmin: client,
      teacherUserIds: ['teacher'],
    });
    expect(result.error).toEqual({ message: 'unavailable' });
    expect(result.teacherIds.size).toBe(0);
  });
});
