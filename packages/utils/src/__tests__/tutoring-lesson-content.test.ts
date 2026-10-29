import { describe, expect, it } from 'vitest';
import {
  getMissedClassNotes,
  getMissedLessonContent,
  getMissedLessonNotes,
  type TutoringClassPost,
  type TutoringLessonNoteSession,
} from '../tutoring-lesson-content';

const HCM = 'Asia/Ho_Chi_Minh';

function lesson(
  overrides: Partial<TutoringLessonNoteSession> = {}
): TutoringLessonNoteSession {
  return {
    description: null,
    descriptionJson: null,
    recurrenceInstanceDate: null,
    startTimezone: HCM,
    startsAt: '2026-10-05T11:00:00.000Z',
    status: 'scheduled',
    ...overrides,
  } as TutoringLessonNoteSession;
}

function richText(text: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

describe('getMissedLessonNotes', () => {
  it('drafts one dated line per missed date and lists dates without notes', () => {
    const result = getMissedLessonNotes(
      [
        lesson({
          description: 'Unit 3 grammar',
          startsAt: '2026-10-06T11:00:00.000Z',
        }),
        lesson({ description: 'Unit 2 vocab' }),
      ],
      ['2026-10-05', '2026-10-06', '2026-10-07']
    );

    expect(result.content).toBe(
      '2026-10-05: Unit 2 vocab\n2026-10-06: Unit 3 grammar'
    );
    expect(result.contentByDate).toEqual({
      '2026-10-05': '2026-10-05: Unit 2 vocab',
      '2026-10-06': '2026-10-06: Unit 3 grammar',
    });
    expect(result.missingDates).toEqual(['2026-10-07']);
  });

  it('reads the date in the class timezone, not UTC', () => {
    // 20:00 UTC is already 03:00 the next day in Ho Chi Minh City.
    const late = lesson({
      description: 'Late lesson',
      startsAt: '2026-10-05T20:00:00.000Z',
    });

    expect(getMissedLessonNotes([late], ['2026-10-06']).content).toBe(
      '2026-10-06: Late lesson'
    );
    expect(getMissedLessonNotes([late], ['2026-10-05']).missingDates).toEqual([
      '2026-10-05',
    ]);
  });

  it('prefers the recurrence instance date over the start timestamp', () => {
    const result = getMissedLessonNotes(
      [
        lesson({
          description: 'Moved lesson',
          recurrenceInstanceDate: '2026-10-01',
          startsAt: '2026-10-20T11:00:00.000Z',
        }),
      ],
      ['2026-10-01']
    );

    expect(result.content).toBe('2026-10-01: Moved lesson');
  });

  it('prefers rich text over the plain description and trims both', () => {
    const rich = getMissedLessonNotes(
      [
        lesson({
          description: 'plain fallback',
          descriptionJson: richText('  Rich notes  '),
        }),
      ],
      ['2026-10-05']
    );
    expect(rich.content).toBe('2026-10-05: Rich notes');

    const fallback = getMissedLessonNotes(
      [
        lesson({
          description: '  plain fallback  ',
          descriptionJson: richText('   '),
        }),
      ],
      ['2026-10-05']
    );
    expect(fallback.content).toBe('2026-10-05: plain fallback');
  });

  it('ignores cancelled sessions, blank notes and dates that were not missed', () => {
    const result = getMissedLessonNotes(
      [
        lesson({ description: 'cancelled', status: 'cancelled' }),
        lesson({
          description: '   ',
          startsAt: '2026-10-06T11:00:00.000Z',
        }),
        lesson({
          description: 'attended',
          startsAt: '2026-10-07T11:00:00.000Z',
        }),
      ],
      ['2026-10-05', '2026-10-06']
    );

    expect(result.content).toBe('');
    expect(result.contentByDate).toEqual({});
    expect(result.missingDates).toEqual(['2026-10-05', '2026-10-06']);
  });

  it('joins several notes recorded on the same date and sorts by date', () => {
    const result = getMissedLessonNotes(
      [
        lesson({
          description: 'Second',
          startsAt: '2026-10-06T11:00:00.000Z',
        }),
        lesson({ description: 'First A' }),
        lesson({
          description: 'First B',
          startsAt: '2026-10-05T12:00:00.000Z',
        }),
      ],
      ['2026-10-06', '2026-10-05']
    );

    expect(result.content.split('\n')).toEqual([
      '2026-10-05: First A',
      '2026-10-05: First B',
      '2026-10-06: Second',
    ]);
    expect(result.contentByDate?.['2026-10-05']).toBe(
      '2026-10-05: First A\n2026-10-05: First B'
    );
  });

  it('skips a session whose timezone cannot be resolved', () => {
    const result = getMissedLessonNotes(
      [lesson({ description: 'Broken zone', startTimezone: 'Not/AZone' })],
      ['2026-10-05']
    );

    expect(result.content).toBe('');
    expect(result.missingDates).toEqual(['2026-10-05']);
  });

  it('reports nothing for an empty absence list', () => {
    expect(getMissedLessonNotes([lesson({ description: 'x' })], [])).toEqual({
      content: '',
      contentByDate: {},
      missingDates: [],
    });
  });
});

describe('getMissedLessonContent', () => {
  it('returns only the drafted content text', () => {
    expect(
      getMissedLessonContent(
        [lesson({ description: 'Unit 2 vocab' })],
        ['2026-10-05']
      )
    ).toBe('2026-10-05: Unit 2 vocab');
  });
});

describe('getMissedClassNotes', () => {
  const post = (
    overrides: Partial<TutoringClassPost> = {}
  ): TutoringClassPost => ({
    content: 'Body',
    createdAt: '2026-10-05T10:00:00.000Z',
    title: 'Title',
    ...overrides,
  });

  it('keeps session notes and class posts apart, per missed date', () => {
    const result = getMissedClassNotes(
      [lesson({ description: 'Session notes' })],
      [post()],
      ['2026-10-05', '2026-10-06'],
      HCM
    );

    expect(result.content).toBe('2026-10-05: Session notes');
    expect(result.postContent).toBe('2026-10-05: Title\nBody');
    expect(result.postContentByDate).toEqual({
      '2026-10-05': '2026-10-05: Title\nBody',
    });
    expect(result.missingDates).toEqual(['2026-10-06']);
  });

  it('counts a post as covering a date that has no session notes', () => {
    const result = getMissedClassNotes(
      [],
      [post({ title: null })],
      ['2026-10-05'],
      HCM
    );

    expect(result.content).toBe('');
    expect(result.postContent).toBe('2026-10-05: Body');
    expect(result.missingDates).toEqual([]);
  });

  it('uses the title alone and drops posts that are blank or off-date', () => {
    const result = getMissedClassNotes(
      [],
      [
        post({ content: null, title: ' Only title ' }),
        post({ content: ' ', title: null }),
        post({ createdAt: '2026-10-09T10:00:00.000Z' }),
        post({ createdAt: 'not a date' }),
      ],
      ['2026-10-05'],
      HCM
    );

    expect(result.postContent).toBe('2026-10-05: Only title');
  });

  it('orders posts by date then creation time', () => {
    const result = getMissedClassNotes(
      [],
      [
        post({
          content: 'later',
          createdAt: '2026-10-05T12:00:00.000Z',
          title: null,
        }),
        post({
          content: 'next day',
          createdAt: '2026-10-06T01:00:00.000Z',
          title: null,
        }),
        post({
          content: 'earlier',
          createdAt: '2026-10-05T09:00:00.000Z',
          title: null,
        }),
      ],
      ['2026-10-05', '2026-10-06'],
      HCM
    );

    expect(result.postContent.split('\n')).toEqual([
      '2026-10-05: earlier',
      '2026-10-05: later',
      '2026-10-06: next day',
    ]);
    expect(result.postContentByDate?.['2026-10-05']).toBe(
      '2026-10-05: earlier\n2026-10-05: later'
    );
  });

  it('reads a post date in the class timezone', () => {
    const lateUtc = post({
      content: 'Written after midnight local time',
      createdAt: '2026-10-05T18:30:00.000Z',
      title: null,
    });

    expect(
      getMissedClassNotes([], [lateUtc], ['2026-10-06'], HCM).postContent
    ).toBe('2026-10-06: Written after midnight local time');
    expect(
      getMissedClassNotes([], [lateUtc], ['2026-10-05'], 'UTC').postContent
    ).toBe('2026-10-05: Written after midnight local time');
  });
});
