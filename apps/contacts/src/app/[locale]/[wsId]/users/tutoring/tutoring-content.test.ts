import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { getMissedLessonContent } from './tutoring-content';

describe('make-up lesson content', () => {
  it('uses the missed class lesson, preserving rich text and local dates', () => {
    const session = {
      description: null,
      descriptionJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Unit 3 food' }],
          },
        ],
      },
      recurrenceInstanceDate: null,
      startTimezone: 'Asia/Ho_Chi_Minh',
      startsAt: '2026-09-20T01:00:00Z',
      status: 'scheduled',
    } as WorkspaceUserGroupSession;

    expect(getMissedLessonContent([session], ['2026-09-20'])).toBe(
      '2026-09-20: Unit 3 food'
    );
    expect(getMissedLessonContent([session], ['2026-09-21'])).toBe('');
  });
});
