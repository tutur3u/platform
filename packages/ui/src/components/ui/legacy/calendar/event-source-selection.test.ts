import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import { expect, it } from 'vitest';
import { findEventSourceOption } from './event-source-selection';

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
