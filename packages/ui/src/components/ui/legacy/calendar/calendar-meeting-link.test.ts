import { describe, expect, it } from 'vitest';
import { getCalendarMeetingUrl } from './calendar-meeting-link';

describe('getCalendarMeetingUrl', () => {
  it('returns the trusted Meet URL from a scheduled meeting event', () => {
    expect(
      getCalendarMeetingUrl({
        scheduling_metadata: {
          type: 'tuturuuu_meeting',
          meeting_url: 'https://meet.tuturuuu.com/personal/meetings/meeting-1',
        },
      })
    ).toBe('https://meet.tuturuuu.com/personal/meetings/meeting-1');
  });

  it('rejects untrusted and unrelated event URLs', () => {
    expect(
      getCalendarMeetingUrl({
        scheduling_metadata: {
          type: 'tuturuuu_meeting',
          meeting_url: 'https://example.test/phishing',
        },
      })
    ).toBeNull();
    expect(getCalendarMeetingUrl({ scheduling_metadata: null })).toBeNull();
  });
});
