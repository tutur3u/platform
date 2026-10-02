import { render, screen } from '@testing-library/react';
import { CalendarPreferencesProvider } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventPreviewPopover } from './event-preview-popover';
import { formatEventPreviewTime } from './event-preview-time';

const colorState = vi.hoisted(() => ({
  metadata: undefined as unknown,
  source: undefined as string | undefined,
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    previewEvent: {
      id: 'synthetic-event',
      title: 'Synthetic timezone regression',
      color: 'BLUE',
      scheduling_metadata: colorState.metadata,
      _calendarColor: colorState.source,
      start_at: '2026-09-30T11:00:00Z',
      end_at: '2026-09-30T13:00:00Z',
    },
    isPreviewOpen: true,
    closePreview: vi.fn(),
    openEventEditor: vi.fn(),
    deleteEvent: vi.fn(),
    readOnly: true,
  }),
}));
vi.mock('next-intl', () => ({ useLocale: () => 'en-US' }));

beforeEach(() => {
  colorState.metadata = undefined;
  colorState.source = undefined;
});
it.each([false, true])(
  'preview dot selects provider/inherited intent: %s',
  (inherited) => {
    colorState.source = '#ff80ab';
    colorState.metadata = {
      google_color: { version: 1, inherited, background: '#00ff88' },
    };
    const { container } = render(
      <CalendarPreferencesProvider
        value={{ timezone: 'UTC', timeFormat: '24h' }}
      >
        <EventPreviewPopover />
      </CalendarPreferencesProvider>
    );
    expect(container.querySelector('.rounded-full')).toHaveStyle({
      backgroundColor: inherited ? '#ff80ab' : '#00ff88',
    });
  }
);

describe('calendar quick preview timezone', () => {
  it('renders the actual preview in the calendar zone and 24-hour preference', () => {
    render(
      <CalendarPreferencesProvider
        value={{ timezone: 'Asia/Ho_Chi_Minh', timeFormat: '24h' }}
      >
        <EventPreviewPopover />
      </CalendarPreferencesProvider>
    );
    expect(screen.getByText('Wed, Sep 30 - 18:00 - 20:00')).toBeTruthy();
  });

  it('compares calendar dates in the selected zone across midnight', () => {
    expect(
      formatEventPreviewTime(
        '2026-09-30T16:30:00Z',
        '2026-09-30T18:30:00Z',
        { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '24h' },
        'en-US'
      )
    ).toBe('Wed, Sep 30, 23:30 - Thu, Oct 1, 01:30');
  });

  it('projects each instant independently across a DST gap', () => {
    expect(
      formatEventPreviewTime(
        '2026-03-08T06:30:00Z',
        '2026-03-08T07:30:00Z',
        { timezone: 'America/New_York', timeFormat: '24h' },
        'en-US'
      )
    ).toBe('Sun, Mar 8 - 01:30 - 03:30');
  });

  it('accepts Unicode whitespace in Intl twelve-hour labels', () => {
    const original:
      | TypedPropertyDescriptor<Intl.DateTimeFormat['format']>
      | undefined = Object.getOwnPropertyDescriptor(
      Intl.DateTimeFormat.prototype,
      'format'
    );
    if (!original?.get) throw new Error('Intl formatter getter unavailable');
    const getFormat = original.get;
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
      ...original,
      get(this: Intl.DateTimeFormat): Intl.DateTimeFormat['format'] {
        const formatter = getFormat.call(this);
        const unicodeFormat: Intl.DateTimeFormat['format'] = (date) =>
          formatter(date).replace(/\s(?=[AP]M)/gu, '\u202f');
        return unicodeFormat;
      },
    });
    try {
      const value = formatEventPreviewTime(
        '2026-09-30T11:00:00Z',
        '2026-09-30T13:00:00Z',
        { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '12h' },
        'en-US'
      );
      expect(value).toContain('06:00\u202fPM');
      expect(value).toMatch(/06:00\s+PM/u);
      expect(value).toMatch(/08:00\s+PM/u);
    } finally {
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', original);
    }
  });
  it('uses the supported locale and twelve-hour clock', () => {
    const value = formatEventPreviewTime(
      '2026-09-30T11:00:00Z',
      '2026-09-30T13:00:00Z',
      { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '12h' },
      'en-US'
    );
    expect(value).toMatch(/06:00\s+PM/u);
    expect(value).toMatch(/08:00\s+PM/u);
    expect(
      formatEventPreviewTime(
        '2026-09-30T11:00:00Z',
        '2026-09-30T13:00:00Z',
        { timezone: 'Asia/Ho_Chi_Minh', timeFormat: '24h' },
        'vi'
      )
    ).toContain('18:00');
  });
});
