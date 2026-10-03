import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { expect, it } from 'vitest';
import { calendarEventUpdatePayload } from '../../../../hooks/calendar-event-write-payload';
import { eventSavePayload } from './event-save-payload';

const original = {
  id: 'saved',
  title: 'Synthetic',
  description: '',
  location: '',
  start_at: '2026-10-02T10:00:00Z',
  end_at: '2026-10-02T11:00:00Z',
  color: 'BLUE',
  locked: false,
} as CalendarEvent;
it('sends only a provider color command for an unchanged existing event', () => {
  const providerColor = { connectionId: 'owned', kind: 'inherit' as const };
  const payload = eventSavePayload(
    {
      ...original,
      providerColor,
      source: { provider: 'google', connectionId: 'owned' },
    },
    original,
    false
  );
  expect(payload).toEqual({ providerColor });
  expect(calendarEventUpdatePayload(payload)).toEqual({ providerColor });
});
it('does not include unchanged native color or source with an ordinary title edit', () => {
  expect(eventSavePayload({ ...original, title: 'Changed' }, original)).toEqual(
    { title: 'Changed' }
  );
});
it('includes a calendar transfer only when its source actually changed', () => {
  const source = { provider: 'google' as const, connectionId: 'new' };
  expect(eventSavePayload({ ...original, source }, original, true)).toEqual({
    source,
  });
});
