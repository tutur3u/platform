import { describe, expect, it } from 'vitest';
import {
  buildUserGroupActivitySummary,
  mapUserGroupActivityRowToEvent,
} from './normalize';

describe('user group activity normalization', () => {
  it('summarizes membership additions with group, user, and role context', () => {
    const event = mapUserGroupActivityRowToEvent({
      action: 'created',
      actor_auth_uid: '00000000-0000-0000-0000-000000000010',
      actor_email: 'teacher@example.com',
      actor_id: '00000000-0000-0000-0000-000000000010',
      actor_name: 'Teacher One',
      actor_workspace_user_id: '00000000-0000-0000-0000-000000000011',
      affected_user_email: 'student@example.com',
      affected_user_id: '00000000-0000-0000-0000-000000000012',
      affected_user_name: 'Student One',
      after: { role: 'STUDENT' },
      audit_record_id: 123,
      before: {},
      changed_fields: ['group_id', 'role', 'user_id'],
      group_id: '00000000-0000-0000-0000-000000000013',
      group_name: 'Class A',
      occurred_at: '2026-05-21T01:00:00.000Z',
      resource_id: '00000000-0000-0000-0000-000000000012',
      resource_label: 'Student One',
      resource_type: 'membership',
      table_name: 'workspace_user_groups_users',
      total_count: 1,
    });

    expect(event.summary).toBe('Added Student One to Class A as STUDENT');
    expect(event.group.name).toBe('Class A');
    expect(event.affectedUser?.email).toBe('student@example.com');
    expect(event.changedFields).toEqual(['group_id', 'role', 'user_id']);
  });

  it('summarizes metric updates with changed field labels', () => {
    expect(
      buildUserGroupActivitySummary({
        action: 'updated',
        affectedUser: null,
        changedFields: ['factor', 'unit'],
        group: {
          id: '00000000-0000-0000-0000-000000000013',
          name: 'Class A',
        },
        resourceLabel: 'Speaking',
        resourceType: 'metric',
      })
    ).toBe('Updated Factor and Unit for metric Speaking in Class A');
  });
});
