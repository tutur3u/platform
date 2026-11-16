import { expect, it, vi } from 'vitest';
import { getCalendarAttendees } from './calendar-attendees';
it('reads only the encoded local event path with no client organizer or provider identity', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ attendeeEditing: false }));
  expect(
    await getCalendarAttendees('ws/path', 'event/path', {
      baseUrl: 'https://calendar.test',
      fetch,
    })
  ).toEqual({ attendeeEditing: false });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    'https://calendar.test/api/v1/workspaces/ws%2Fpath/calendar/events/event%2Fpath/attendees',
    expect.objectContaining({ cache: 'no-store' })
  );
});
