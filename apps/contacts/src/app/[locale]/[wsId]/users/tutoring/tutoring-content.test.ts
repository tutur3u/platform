import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  buildQueueDraftContent,
  buildQueueSlotDrafts,
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
      contentByDate: { '2026-09-20': '2026-09-20: Unit 3 food' },
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
      contentByDate: {},
      postContent: '2026-10-22: Bài 5\nPhần bài viết ngày 22',
      postContentByDate: {
        '2026-10-22': '2026-10-22: Bài 5\nPhần bài viết ngày 22',
      },
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
      contentByDate: { '2026-10-22': '2026-10-22: Unit 3' },
      postContent: '2026-10-23: Ôn tập',
      postContentByDate: { '2026-10-23': '2026-10-23: Ôn tập' },
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

describe('per-session content split', () => {
  const dated = {
    content: [
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
      '2026-10-24: Unit 6',
    ].join('\n'),
    contentByDate: {
      '2026-10-20': '2026-10-20: Unit 4',
      '2026-10-22': '2026-10-22: Unit 5',
      '2026-10-24': '2026-10-24: Unit 6',
    },
    missingDates: [],
    postContent: '',
    postContentByDate: {},
  };
  const item = (
    reason_type: 'ABSENT_RECOVERY' | 'WEAK_SUPPORT' | 'BOTH',
    dates: string[]
  ) => ({
    feedback_content: 'Needs phonics practice',
    missed_class_dates: dates,
    reason_type,
  });

  it('splits two missed dates across two sessions, oldest first', () => {
    const drafts = buildQueueSlotDrafts(
      item('ABSENT_RECOVERY', ['2026-10-22', '2026-10-20']),
      dated,
      labels,
      2
    );
    expect(drafts).toEqual([
      {
        content: '2026-10-20: Unit 4',
        linkedContent: '2026-10-20: Unit 4',
        pairedMissedDate: '2026-10-20',
      },
      {
        content: '2026-10-22: Unit 5',
        linkedContent: '2026-10-22: Unit 5',
        pairedMissedDate: '2026-10-22',
      },
    ]);
  });

  it('splits three missed dates across three sessions', () => {
    const drafts = buildQueueSlotDrafts(
      item('ABSENT_RECOVERY', ['2026-10-20', '2026-10-22', '2026-10-24']),
      dated,
      labels,
      3
    );
    expect(drafts.map((draft) => draft.content)).toEqual([
      '2026-10-20: Unit 4',
      '2026-10-22: Unit 5',
      '2026-10-24: Unit 6',
    ]);
  });

  it('labels a day with both notes and a post, and saves it as written', () => {
    const [first, second] = buildQueueSlotDrafts(
      item('ABSENT_RECOVERY', ['2026-10-20', '2026-10-22']),
      {
        ...dated,
        postContent: '2026-10-20: Bài viết',
        postContentByDate: { '2026-10-20': '2026-10-20: Bài viết' },
      },
      labels,
      2
    );
    expect(first).toEqual({
      content:
        'Ghi chú buổi học:\n2026-10-20: Unit 4\n\nBài viết:\n2026-10-20: Bài viết',
      linkedContent: undefined,
      pairedMissedDate: '2026-10-20',
    });
    expect(second?.content).toBe('2026-10-22: Unit 5');
  });

  it('leaves a session beyond the missed dates without class notes', () => {
    const drafts = buildQueueSlotDrafts(
      item('ABSENT_RECOVERY', ['2026-10-20']),
      dated,
      labels,
      2
    );
    expect(drafts[1]).toEqual({ content: '', linkedContent: '' });
  });

  it('repeats the homeroom teacher note for every weak-support session', () => {
    const drafts = buildQueueSlotDrafts(
      item('WEAK_SUPPORT', []),
      { content: '', missingDates: [], postContent: '' },
      labels,
      3
    );
    expect(drafts).toEqual(
      Array.from({ length: 3 }, () => ({
        content: 'Needs phonics practice',
        linkedContent: undefined,
      }))
    );
  });

  it('pairs each session own missed day with the weak note for both reasons', () => {
    const drafts = buildQueueSlotDrafts(
      item('BOTH', ['2026-10-20', '2026-10-22']),
      dated,
      labels,
      2
    );
    expect(drafts.map((draft) => draft.content)).toEqual([
      'Kèm nghỉ:\n2026-10-20: Unit 4\n\nKèm yếu:\nNeeds phonics practice',
      'Kèm nghỉ:\n2026-10-22: Unit 5\n\nKèm yếu:\nNeeds phonics practice',
    ]);
    expect(drafts.every((draft) => draft.linkedContent === undefined)).toBe(
      true
    );
  });

  it('behaves like the single draft with one session', () => {
    const single = item('ABSENT_RECOVERY', ['2026-10-20', '2026-10-22']);
    expect(buildQueueSlotDrafts(single, dated, labels, 1)).toEqual([
      {
        content: dated.content,
        linkedContent: dated.content,
      },
    ]);
  });

  it('derives the per-date split from class sessions', () => {
    const result = getMissedLessonNotes(
      [
        lesson('2026-10-20T01:00:00Z', 'Unit 4'),
        lesson('2026-10-22T01:00:00Z', 'Unit 5'),
      ],
      ['2026-10-20', '2026-10-22']
    );
    expect(result.contentByDate).toEqual({
      '2026-10-20': '2026-10-20: Unit 4',
      '2026-10-22': '2026-10-22: Unit 5',
    });
    const withPosts = getMissedClassNotes(
      [lesson('2026-10-20T01:00:00Z', 'Unit 4')],
      [
        {
          content: 'Body',
          createdAt: '2026-10-22T03:00:00Z',
          title: 'Title',
        },
      ],
      ['2026-10-20', '2026-10-22'],
      'Asia/Ho_Chi_Minh'
    );
    expect(withPosts.postContentByDate).toEqual({
      '2026-10-22': '2026-10-22: Title\nBody',
    });
  });
});
