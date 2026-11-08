import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyWorkspaceTeacher,
  listWorkspaceTeacherIds,
  listWorkspaceTutorIds,
  workspaceTeachersQuery,
} from './teachers';

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
    // Each membership carries its group so roles can be classified.
    expect(query.select.mock.calls[0]?.[0]).toContain(',group_id)');
  });
  it.each([
    ['tutor only', ['tutor-group'], { isTutor: true, isClassTeacher: false }],
    ['class only', ['class-group'], { isTutor: false, isClassTeacher: true }],
    [
      'both',
      ['class-group', 'tutor-group'],
      { isTutor: true, isClassTeacher: true },
    ],
  ])('classifies %s teachers', (_name, groups, expected) => {
    expect(
      classifyWorkspaceTeacher(
        groups.map((group_id) => ({ group_id })),
        ['tutor-group']
      )
    ).toEqual(expected);
  });
  it('treats every teacher as a class teacher when no tutor group is set', () => {
    expect(classifyWorkspaceTeacher([{ group_id: 'class-group' }], [])).toEqual(
      { isTutor: false, isClassTeacher: true }
    );
  });
  it('finds tutors only through TEACHER membership of the tutor groups in this center', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(async () => ({
        data: [{ user_id: 'a' }, { user_id: 'a' }, { user_id: 'b' }],
        error: null,
      })),
    };
    const sbAdmin = {
      from: vi.fn(() => query),
    } as unknown as TypedSupabaseClient;
    const result = await listWorkspaceTutorIds({
      normalizedWsId: 'center',
      sbAdmin,
      tutorGroupIds: ['tutor-group'],
    });
    expect(query.eq.mock.calls).toEqual([
      ['role', 'TEACHER'],
      ['group.ws_id', 'center'],
    ]);
    expect(query.in).toHaveBeenCalledWith('group_id', ['tutor-group']);
    expect(result.tutorIds).toEqual(['a', 'b']);
    const none = await listWorkspaceTutorIds({
      normalizedWsId: 'center',
      sbAdmin,
      tutorGroupIds: [],
    });
    expect(none.tutorIds).toEqual([]);
    expect(sbAdmin.from).toHaveBeenCalledTimes(1);
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
