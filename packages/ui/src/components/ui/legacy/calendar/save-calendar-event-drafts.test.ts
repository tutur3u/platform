import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { expect, it, vi } from 'vitest';
import { saveCalendarEventDrafts } from './save-calendar-event-drafts';

it('retains rejected or unconfirmed drafts and retries only those events', async () => {
  const drafts = [
    { title: 'Saved' },
    { title: 'Rejected', description: 'Keep this content' },
    { title: 'Unconfirmed' },
  ];
  const addEvent = vi
    .fn()
    .mockResolvedValueOnce({ id: 'event-1' } as CalendarEvent)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(undefined);
  const result = await saveCalendarEventDrafts(drafts, addEvent, undefined);
  expect(result.savedEvents).toEqual([{ id: 'event-1' }]);
  expect(result.failedEvents).toEqual(drafts.slice(1));
  addEvent.mockResolvedValue({ id: 'retried-event' });
  await saveCalendarEventDrafts(result.failedEvents, addEvent, undefined);
  expect(addEvent.mock.calls.slice(3).map(([event]) => event.title)).toEqual([
    'Rejected',
    'Unconfirmed',
  ]);
});
