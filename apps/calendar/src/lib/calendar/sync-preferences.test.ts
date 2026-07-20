import { describe, expect, it } from 'vitest';
import type { CalendarSourceOption } from './source-resolver';
import { buildDefaultPreferenceSourceColumns } from './sync-preferences';

describe('buildDefaultPreferenceSourceColumns', () => {
  it('uses the native primary calendar for a new preference row', () => {
    const options: CalendarSourceOption[] = [
      {
        id: 'tuturuuu:custom',
        provider: 'tuturuuu',
        workspaceCalendarId: 'custom',
        label: 'Custom',
        color: null,
        writable: true,
      },
      {
        id: 'tuturuuu:primary',
        provider: 'tuturuuu',
        workspaceCalendarId: 'primary',
        label: 'Primary',
        color: null,
        primary: true,
        writable: true,
      },
    ];

    expect(buildDefaultPreferenceSourceColumns(options)).toEqual({
      default_provider: 'tuturuuu',
      default_workspace_calendar_id: 'primary',
      default_calendar_connection_id: null,
    });
  });

  it('falls back to a writable provider calendar when native calendars are absent', () => {
    const options: CalendarSourceOption[] = [
      {
        id: 'google:connection',
        provider: 'google',
        connectionId: 'connection',
        workspaceCalendarId: null,
        externalCalendarId: 'provider-calendar',
        accessRole: 'writer',
        accountEmail: 'member@example.com',
        accountName: 'Member',
        label: 'Provider calendar',
        color: null,
        writable: true,
      },
    ];

    expect(buildDefaultPreferenceSourceColumns(options)).toEqual({
      default_provider: 'google',
      default_workspace_calendar_id: null,
      default_calendar_connection_id: 'connection',
    });
  });

  it('rejects creating an invalid source tuple', () => {
    expect(() => buildDefaultPreferenceSourceColumns([])).toThrow(
      'No writable calendar is available'
    );
  });
});
