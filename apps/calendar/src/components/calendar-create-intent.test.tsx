// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({
  createEvent: vi.fn(),
  disabled: false,
}));

vi.mock('@tuturuuu/ui/legacy/calendar/calendar-header-new-event', () => ({
  useCreateCalendarEvent: () => ({
    createEvent: hook.createEvent,
    disabled: hook.disabled,
  }),
}));
vi.mock('@tuturuuu/tasks-ui/calendar/components/calendar-header-actions', () => ({
  CalendarHeaderActions: () => <button type="button">new-event</button>,
}));

import {
  readCalendarCreateIntent,
  withoutCalendarCreateIntent,
} from './calendar-create-intent';
import {
  CalendarCreateIntentConsumer,
  CalendarHeaderActionsWithCreateIntent,
} from './calendar-header-actions-with-create-intent';

const visit = (path: string) => window.history.replaceState(null, '', path);
const current = () => `${window.location.pathname}${window.location.search}`;

describe('readCalendarCreateIntent', () => {
  it('accepts exactly one create=event', () => {
    expect(readCalendarCreateIntent('?create=event')).toEqual({ createEvent: true, present: true });
    expect(readCalendarCreateIntent('?date=2026-11-16')).toEqual({ createEvent: false, present: false });
  });

  it('rejects repeated or unknown values but still marks them for removal', () => {
    for (const search of ['?create=event&create=event', '?create=task', '?create=', '?create=EVENT']) {
      expect(readCalendarCreateIntent(search)).toEqual({ createEvent: false, present: true });
    }
  });

  it('removes only create, keeping date, eventId and the hash', () => {
    expect(
      withoutCalendarCreateIntent(
        'https://calendar.example/ws-1?date=2026-11-16&create=event&eventId=e1#top'
      )
    ).toBe('/ws-1?date=2026-11-16&eventId=e1#top');
  });
});

describe('CalendarCreateIntentConsumer', () => {
  beforeEach(() => {
    hook.createEvent.mockClear();
    hook.disabled = false;
  });
  afterEach(cleanup);

  it('opens the existing New event draft once and clears the intent', () => {
    visit('/ws-1?create=event&date=2026-11-20');
    const { rerender } = render(<CalendarCreateIntentConsumer />);
    rerender(<CalendarCreateIntentConsumer />);

    expect(hook.createEvent).toHaveBeenCalledTimes(1);
    expect(current()).toBe('/ws-1?date=2026-11-20');
  });

  it('does not reopen after a remount, reload or Back to the same entry', () => {
    visit('/ws-1?create=event');
    render(<CalendarCreateIntentConsumer />);
    cleanup();
    // The history entry was rewritten, so a remount, reload or Back sees no intent.
    render(<CalendarCreateIntentConsumer />);

    expect(hook.createEvent).toHaveBeenCalledTimes(1);
    expect(current()).toBe('/ws-1');
  });

  it('never opens for a read-only viewer, but still clears the intent', () => {
    hook.disabled = true;
    visit('/ws-1?create=event');
    render(<CalendarCreateIntentConsumer />);

    expect(hook.createEvent).not.toHaveBeenCalled();
    expect(current()).toBe('/ws-1');
  });

  it('waits for timezone setup before consuming and opening a valid intent', () => {
    visit('/ws-1?create=event&date=2026-11-20');
    const { rerender } = render(<CalendarCreateIntentConsumer creationBlocked />);
    expect(hook.createEvent).not.toHaveBeenCalled();
    expect(current()).toBe('/ws-1?create=event&date=2026-11-20');

    rerender(<CalendarCreateIntentConsumer creationBlocked={false} />);
    rerender(<CalendarCreateIntentConsumer creationBlocked={false} />);
    expect(hook.createEvent).toHaveBeenCalledTimes(1);
    expect(current()).toBe('/ws-1?date=2026-11-20');
  });

  it('ignores a repeated create parameter', () => {
    visit('/ws-1?create=event&create=event&eventId=e1');
    render(<CalendarCreateIntentConsumer />);

    expect(hook.createEvent).not.toHaveBeenCalled();
    expect(current()).toBe('/ws-1?eventId=e1');
  });

  it('leaves plain date and event links untouched', () => {
    visit('/ws-1?date=2026-11-16&eventId=e1');
    render(<CalendarHeaderActionsWithCreateIntent workspaceId="ws-1" enableSmartScheduling />);

    expect(hook.createEvent).not.toHaveBeenCalled();
    expect(current()).toBe('/ws-1?date=2026-11-16&eventId=e1');
  });
});
