import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { expect, it, vi } from 'vitest';
import {
  createCalendarCreationRequests,
  newCalendarCreationRequestId,
} from '../../../../hooks/calendar-creation-request';
import {
  prepareCalendarEventDrafts,
  saveCalendarEventDrafts,
} from './save-calendar-event-drafts';

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

it('retains distinct AI draft IDs and immutable payload across a lost-response batch retry', async () => {
  const controller = createCalendarCreationRequests();
  const manualId = newCalendarCreationRequestId();
  controller.forAttempt({ title: 'Manual' }, manualId);
  const drafts = prepareCalendarEventDrafts(
    ['First AI', 'Second AI'].map((title) => ({ title }))
  );
  const attempts: { id: string; event: unknown }[] = [];
  const addEvent = vi.fn(async (event, options) => {
    attempts.push({
      id: controller.forAttempt(event, options?.requestId),
      event,
    });
    if (attempts.length <= 2) throw new Error('lost response');
    return { id: 'confirmed' } as CalendarEvent;
  });
  const failed = await saveCalendarEventDrafts(drafts, addEvent, undefined);
  expect(failed.failedEvents).toEqual(drafts);
  await saveCalendarEventDrafts(failed.failedEvents, addEvent, undefined);
  expect(new Set([manualId, attempts[0]!.id, attempts[1]!.id]).size).toBe(3);
  expect(attempts[2]).toEqual(attempts[0]);
  expect(attempts[3]).toEqual(attempts[1]);
  expect(drafts.map((d) => d.requestId)).toEqual(
    attempts.slice(0, 2).map((a) => a.id)
  );
});
