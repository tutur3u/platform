import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  buildQueueDraftContent,
  getMissedClassNotes,
  getMissedLessonContent,
  getMissedLessonNotes,
} from './tutoring-content';

const lesson = (startsAt: string, text: string | null) =>
  ({
    description: text,
    descriptionJson: null,
    recurrenceInstanceDate: null,
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt,
    status: 'scheduled',
  }) as WorkspaceUserGroupSession;

const labels = {
  absent: 'Kèm nghỉ',
  lessonNotes: 'Ghi chú buổi học',
  posts: 'Bài viết',
  weak: 'Kèm yếu',
};
const noNotes = { content: '', postContent: '', missingDates: ['2026-09-21'] };
const notes = {
  content: '2026-09-20: Unit 3 food',
  postContent: '',
  missingDates: [],
};
const withPost = {
  content: '2026-09-20: Unit 3 food',
  postContent: '2026-09-20: Bài viết ngày 20',
  missingDates: [],
};

describe('make-up lesson content', () => {
  it('uses the missed class lesson, preserving rich text and local dates', () => {
    const session = {
      ...lesson('2026-09-20T01:00:00Z', null),
      descriptionJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Unit 3 food' }],
          },
        ],
      },
    } as WorkspaceUserGroupSession;

    expect(getMissedLessonContent([session], ['2026-09-20'])).toBe(
      '2026-09-20: Unit 3 food'
    );
    expect(getMissedLessonContent([session], ['2026-09-21'])).toBe('');
  });

  it('reports missed dates with no class session or no recorded notes', () => {
    const sessions = [
      lesson('2026-09-20T01:00:00Z', 'Unit 3 food'),
      lesson('2026-09-22T01:00:00Z', '  '),
    ];
    expect(
      getMissedLessonNotes(sessions, [
        '2026-09-22',
        '2026-09-20',
        '2026-09-21',
        '2026-09-21',
      ])
    ).toEqual({
      content: '2026-09-20: Unit 3 food',
      missingDates: ['2026-09-21', '2026-09-22'],
    });
  });
});

describe('missed class posts', () => {
  const post = (createdAt: string, title: string | null, content: string) => ({
    content,
    createdAt,
    title,
  });
  const zone = 'Asia/Ho_Chi_Minh';

  it('reads a post on the class-local date it was created', () => {
    // 20:00 UTC on 21/10 is 03:00 on 22/10 in Ho Chi Minh City.
    const posts = [
      post('2026-10-21T20:00:00Z', 'Bài 5', 'Phần bài viết ngày 22'),
      post('2026-10-22T20:00:00Z', 'Bài 6', 'Ngày 23'),
    ];
    expect(getMissedClassNotes([], posts, ['2026-10-22'], zone)).toEqual({
      content: '',
      postContent: '2026-10-22: Bài 5\nPhần bài viết ngày 22',
      missingDates: [],
    });
  });

  it('keeps session notes and posts apart and reports dates with neither', () => {
    const sessions = [lesson('2026-10-22T11:00:00Z', 'Unit 3')];
    const posts = [post('2026-10-23T03:00:00Z', null, 'Ôn tập')];
    expect(
      getMissedClassNotes(
        sessions,
        posts,
        ['2026-10-22', '2026-10-23', '2026-10-24'],
        zone
      )
    ).toEqual({
      content: '2026-10-22: Unit 3',
      postContent: '2026-10-23: Ôn tập',
      missingDates: ['2026-10-24'],
    });
  });

  it('ignores blank posts', () => {
    expect(
      getMissedClassNotes(
        [],
        [post('2026-10-22T03:00:00Z', ' ', ' ')],
        ['2026-10-22'],
        zone
      ).missingDates
    ).toEqual(['2026-10-22']);
  });
});

describe('queue draft content', () => {
  it('drafts absent make-up from the missed lesson and keeps it linked', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'ABSENT_RECOVERY', feedback_content: 'GVCN note' },
        notes,
        labels
      )
    ).toEqual({
      content: '2026-09-20: Unit 3 food',
      linkedContent: '2026-09-20: Unit 3 food',
      missingLessonDates: [],
    });
  });

  it('labels session notes and class posts when both exist, saved as written', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'ABSENT_RECOVERY', feedback_content: '' },
        withPost,
        labels
      )
    ).toEqual({
      content:
        'Ghi chú buổi học:\n2026-09-20: Unit 3 food\n\nBài viết:\n2026-09-20: Bài viết ngày 20',
      linkedContent: undefined,
      missingLessonDates: [],
    });
  });

  it('drafts a lone class post unlabelled', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'ABSENT_RECOVERY', feedback_content: '' },
        { content: '', postContent: '2026-09-20: Bài 5', missingDates: [] },
        labels
      ).content
    ).toBe('2026-09-20: Bài 5');
  });

  it('drafts weak support from the homeroom note alone', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'WEAK_SUPPORT', feedback_content: 'GVCN note' },
        notes,
        labels
      )
    ).toEqual({
      content: 'GVCN note',
      linkedContent: undefined,
      missingLessonDates: [],
    });
  });

  it('carries both labelled texts when a row is both absent and weak', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'BOTH', feedback_content: 'GVCN note' },
        notes,
        labels
      )
    ).toEqual({
      content: 'Kèm nghỉ:\n2026-09-20: Unit 3 food\n\nKèm yếu:\nGVCN note',
      linkedContent: undefined,
      missingLessonDates: [],
    });
  });

  it('nests the posts under kèm nghỉ ahead of kèm yếu for a BOTH row', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'BOTH', feedback_content: 'GVCN note' },
        withPost,
        labels
      ).content
    ).toBe(
      'Kèm nghỉ:\nGhi chú buổi học:\n2026-09-20: Unit 3 food\n\nBài viết:\n2026-09-20: Bài viết ngày 20\n\nKèm yếu:\nGVCN note'
    );
  });

  it('keeps the homeroom note and flags missing notes for a BOTH row', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'BOTH', feedback_content: 'GVCN note' },
        noNotes,
        labels
      )
    ).toEqual({
      content: 'Kèm yếu:\nGVCN note',
      linkedContent: undefined,
      missingLessonDates: ['2026-09-21'],
    });
  });

  it('leaves absent content empty and flags the dates when no notes exist', () => {
    expect(
      buildQueueDraftContent(
        { reason_type: 'ABSENT_RECOVERY', feedback_content: '' },
        noNotes,
        labels
      )
    ).toEqual({
      content: '',
      linkedContent: '',
      missingLessonDates: ['2026-09-21'],
    });
  });
});
