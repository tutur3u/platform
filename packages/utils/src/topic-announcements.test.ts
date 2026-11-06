import { describe, expect, it } from 'vitest';
import {
  isTopicTeacherAssignmentsEnabled,
  TOPIC_TEACHER_ASSIGNMENTS_SECRET,
} from './topic-announcements';

const row = (value: string) => ({
  name: TOPIC_TEACHER_ASSIGNMENTS_SECRET,
  value,
});

describe('isTopicTeacherAssignmentsEnabled', () => {
  it('is on only when the secret is exactly true', () => {
    expect(isTopicTeacherAssignmentsEnabled([row('true')])).toBe(true);
    expect(isTopicTeacherAssignmentsEnabled([row('TRUE')])).toBe(false);
    expect(isTopicTeacherAssignmentsEnabled([row('false')])).toBe(false);
    expect(isTopicTeacherAssignmentsEnabled([])).toBe(false);
    expect(isTopicTeacherAssignmentsEnabled(null)).toBe(false);
    expect(
      isTopicTeacherAssignmentsEnabled([
        { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: 'true' },
      ])
    ).toBe(false);
  });

  it('fails closed when duplicate rows disagree', () => {
    expect(isTopicTeacherAssignmentsEnabled([row('true'), row('false')])).toBe(
      false
    );
    expect(isTopicTeacherAssignmentsEnabled([row('false'), row('true')])).toBe(
      false
    );
    expect(isTopicTeacherAssignmentsEnabled([row('true'), row('true')])).toBe(
      true
    );
  });
});
