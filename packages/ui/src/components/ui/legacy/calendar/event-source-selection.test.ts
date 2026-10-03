import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import { expect, it } from 'vitest';
import { eventModalSavePayload } from './event-save-payload';
import {
  eventSourceChanged,
  findEventSourceOption,
  selectedEventSource,
} from './event-source-selection';

const options = ['one', 'two'].map((id) => ({
  id,
  provider: 'google',
  connectionId: id,
  workspaceCalendarId: id,
  externalCalendarId: 'shared-provider-calendar',
})) as CalendarSourceOption[];
it('matches the canonical workspace source despite identical provider calendar IDs', () => {
  expect(
    findEventSourceOption(options, {
      provider: 'google',
      source_calendar_id: 'two',
      external_calendar_id: 'shared-provider-calendar',
    })?.id
  ).toBe('two');
  expect(
    findEventSourceOption(options, {
      provider: 'google',
      source_calendar_id: 'missing',
      external_calendar_id: 'shared-provider-calendar',
    })
  ).toBeUndefined();
});
it('fails closed when a legacy external calendar ID is ambiguous across accounts', () => {
  expect(
    findEventSourceOption(options, {
      provider: 'google',
      external_calendar_id: 'shared-provider-calendar',
    })
  ).toBeUndefined();
  expect(
    findEventSourceOption(options.slice(0, 1), {
      provider: 'google',
      external_calendar_id: 'shared-provider-calendar',
    })?.id
  ).toBe('one');
});

it('leaves an unresolved existing event on its original source and preserves new defaults', () => {
  const original = {
    id: 'saved',
    provider: 'google' as const,
    source_calendar_id: 'missing',
    external_calendar_id: 'shared-provider-calendar',
  };
  expect(
    selectedEventSource(options, original, null, options[0])
  ).toBeUndefined();
  expect(eventSourceChanged(options, original, null)).toBe(false);
  expect(
    selectedEventSource(options, { id: 'new' }, null, options[0])?.id
  ).toBe('one');
  expect(selectedEventSource(options, original, 'two', options[0])?.id).toBe(
    'two'
  );
  expect(eventSourceChanged(options, original, 'two')).toBe(true);
});

it('sends only a title edit when an existing source cannot be resolved', () => {
  const original = {
    id: 'saved',
    title: 'Original',
    color: 'BLUE' as const,
    provider: 'google' as const,
    source_calendar_id: 'missing',
    start_at: '2026-10-02T10:00:00Z',
    end_at: '2026-10-02T11:00:00Z',
  };
  const selected = selectedEventSource(options, original, null, options[0]);
  expect(
    eventModalSavePayload(
      { ...original, title: 'Changed' },
      original,
      selected?.provider === 'google'
        ? { provider: 'google', connectionId: selected.connectionId }
        : undefined,
      eventSourceChanged(options, original, null)
    )
  ).toEqual({ title: 'Changed' });
});

it('recognizes a legacy Google event before considering native sources', () => {
  const legacy = { google_event_id: 'external', source_calendar_id: 'two' };
  expect(findEventSourceOption(options, legacy)?.id).toBe('two');
  expect(eventSourceChanged(options, legacy, 'two')).toBe(false);
});
