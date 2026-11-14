import { describe, expect, it } from 'vitest';
import {
  classifyMeetings,
  currentMeetingsToShow,
  DEFAULT_PAST_CHOICE,
  filterPastMeetings,
  groupUpcomingByDay,
} from './section-rules';
import type { ScheduledMeeting } from './types';

const NOW = '2026-03-10T12:00:00.000Z';

function meeting(
  id: string,
  time: string | null,
  extra: Partial<ScheduledMeeting> = {}
): ScheduledMeeting {
  return {
    calendar: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    creatorId: 'account-a',
    id,
    name: `Meeting ${id}`,
    time,
    ...extra,
  };
}

describe('Meetings home section rules', () => {
  it('collapses Past by default', () => {
    expect(DEFAULT_PAST_CHOICE).toBe('collapsed');
  });

  it('hides Current without a presence source', () => {
    expect(
      currentMeetingsToShow({ current: [], currentSource: 'unavailable' })
    ).toBeNull();
  });

  it('hides Current when the presence source reports no live meeting', () => {
    expect(
      currentMeetingsToShow({ current: [], currentSource: 'presence' })
    ).toBeNull();
  });

  it('shows Current only for presence-reported meetings', () => {
    const live = {
      ...meeting('live', NOW),
      participantCount: 2,
      viewerJoined: false,
    };
    expect(
      currentMeetingsToShow({ current: [live], currentSource: 'presence' })
    ).toEqual([live]);
  });

  it('never infers a live meeting from its time', () => {
    const startingNow = meeting('now', NOW);
    const { upcoming, past } = classifyMeetings([startingNow], NOW);
    expect([...upcoming, ...past]).toEqual([startingNow]);
  });

  it('orders Upcoming soonest first and Past newest first', () => {
    const result = classifyMeetings(
      [
        meeting('later', '2026-03-12T09:00:00.000Z'),
        meeting('soon', '2026-03-10T15:00:00.000Z'),
        meeting('yesterday', '2026-03-09T09:00:00.000Z'),
        meeting('last-week', '2026-03-03T09:00:00.000Z'),
        meeting('legacy', null),
      ],
      NOW
    );
    expect(result.upcoming.map((entry) => entry.id)).toEqual([
      'soon',
      'later',
    ]);
    expect(result.past.map((entry) => entry.id)).toEqual([
      'yesterday',
      'last-week',
      'legacy',
    ]);
  });

  it('anchors a linked meeting to its Calendar start', () => {
    const linked = meeting('linked', '2026-03-01T09:00:00.000Z', {
      calendar: {
        endAt: '2026-03-11T10:00:00.000Z',
        id: 'event-1',
        startAt: '2026-03-11T09:00:00.000Z',
      },
    });
    expect(classifyMeetings([linked], NOW).upcoming).toEqual([linked]);
  });

  it('groups Upcoming by day in the viewer timezone', () => {
    const groups = groupUpcomingByDay(
      [
        meeting('a', '2026-03-10T15:00:00.000Z'),
        meeting('b', '2026-03-10T23:30:00.000Z'),
        meeting('c', '2026-03-13T09:00:00.000Z'),
      ],
      'Asia/Ho_Chi_Minh',
      NOW
    );
    const summary = groups.map((group) => [
      group.relative,
      group.meetings.length,
    ]);
    expect(summary).toEqual([
      ['today', 1],
      ['tomorrow', 1],
      [null, 1],
    ]);
  });

  it('filters Past to meetings the viewer created', () => {
    const mine = meeting('mine', NOW);
    const theirs = meeting('theirs', NOW, { creatorId: 'account-b' });
    const all = [mine, theirs];
    expect(filterPastMeetings(all, 'mine', 'account-a')).toEqual([mine]);
    expect(filterPastMeetings(all, 'all', 'account-a')).toEqual(all);
  });
});
