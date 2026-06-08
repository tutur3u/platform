import { describe, expect, it } from 'vitest';
import {
  hasScheduledSessions,
  partitionUserGroupsBySchedule,
} from './group-schedule';
import type { UserGroupMembership } from './types';

describe('user group schedule partitioning', () => {
  it('treats groups with non-empty sessions as scheduled', () => {
    expect(hasScheduledSessions({ sessions: ['2026-06-08'] })).toBe(true);
    expect(hasScheduledSessions({ sessions: [] })).toBe(false);
    expect(hasScheduledSessions({ sessions: null })).toBe(false);
  });

  it('splits scheduled and unscheduled groups while counting sessions', () => {
    const groups = [
      group('scheduled-1', ['2026-06-08', '2026-06-10']),
      group('unscheduled-empty', []),
      group('unscheduled-null', null),
      group('scheduled-2', ['2026-06-12']),
    ];

    const result = partitionUserGroupsBySchedule(groups);

    expect(result.scheduledGroups.map((item) => item.id)).toEqual([
      'scheduled-1',
      'scheduled-2',
    ]);
    expect(result.unscheduledGroups.map((item) => item.id)).toEqual([
      'unscheduled-empty',
      'unscheduled-null',
    ]);
    expect(result.scheduledSessionCount).toBe(3);
  });
});

function group(id: string, sessions: string[] | null): UserGroupMembership {
  return {
    id,
    name: id,
    sessions,
    workspace_user_groups_users: [],
  };
}
