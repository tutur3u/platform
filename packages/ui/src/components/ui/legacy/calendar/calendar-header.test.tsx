import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: { timezone: { timezone: 'Asia/Ho_Chi_Minh' } },
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({ addEmptyEvent: vi.fn(), readOnly: false }),
}));

import {
  CALENDAR_HEADER_HEIGHT_CLASS,
  CalendarHeader,
} from './calendar-header';
import { nextHalfHourOn } from './calendar-header-new-event';

const views = [
  { value: 'day', label: 'Day' },
  { value: '4-days', label: '4 Days' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'agenda', label: 'Agenda' },
];

beforeAll(() => {
  // Radix Select measures and scrolls items, which jsdom does not implement.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

function renderHeader(
  overrides: Partial<Parameters<typeof CalendarHeader>[0]> = {}
) {
  const props: Parameters<typeof CalendarHeader>[0] = {
    t: (key: string) => key,
    locale: 'en',
    date: new Date(2026, 10, 18),
    setDate: vi.fn(),
    view: 'week',
    offset: 7,
    availableViews: views,
    onViewChange: vi.fn(),
    extras: <button type="button">New</button>,
    ...overrides,
  };
  render(<CalendarHeader {...props} />);
  return props;
}

describe('CalendarHeader', () => {
  it('renders one fixed-height row with navigation, title, view picker and extras', () => {
    renderHeader();
    const header = document.querySelector('[data-slot="calendar-header"]');
    expect(header).not.toBeNull();
    expect(CALENDAR_HEADER_HEIGHT_CLASS).toBe('h-12');
    expect(header?.className).toContain('h-12');
    expect(header?.className).toContain('flex');
    expect(header?.className).not.toMatch(/flex-col|flex-wrap/);

    const row = within(header as HTMLElement);
    expect(
      row.getByRole('button', { name: 'toolbar.previous_period' })
    ).toBeTruthy();
    expect(
      row.getByRole('button', { name: 'toolbar.next_period' })
    ).toBeTruthy();
    expect(row.getByRole('button', { name: 'this-week' })).toBeTruthy();
    expect(row.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(row.getByRole('combobox', { name: 'toolbar.view' })).toBeTruthy();
    expect(row.getByRole('button', { name: 'New' })).toBeTruthy();
  });

  it('has no lunar toggle and no sync status pill', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /lunar|âm lịch/i })).toBeNull();
    expect(screen.queryByText('sync_completed', { exact: false })).toBeNull();
    expect(screen.queryByText('failed_to_load_events')).toBeNull();
  });

  it('moves by the view offset with the previous and next buttons', () => {
    const props = renderHeader();
    fireEvent.click(
      screen.getByRole('button', { name: 'toolbar.previous_period' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'toolbar.next_period' })
    );
    const setDate = vi.mocked(props.setDate);
    expect(setDate).toHaveBeenCalledTimes(2);
    const base = new Date(2026, 10, 18);
    const back = setDate.mock.calls[0]?.[0];
    const forward = setDate.mock.calls[1]?.[0];
    expect(typeof back === 'function' && back(base).getDate()).toBe(11);
    expect(typeof forward === 'function' && forward(base).getDate()).toBe(25);
  });

  it('lists views with shortcut hints and hides views marked unavailable', () => {
    const props = renderHeader({
      availableViews: views.map((item) =>
        item.value === 'week' || item.value === '4-days'
          ? { ...item, disabled: true }
          : item
      ),
      view: 'day',
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'toolbar.view' }), {
      key: 'Enter',
    });

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'DayD',
      'MonthM',
      'YearY',
      'AgendaA',
    ]);
    expect(screen.getByTestId('calendar-view-shortcut-month').textContent).toBe(
      'M'
    );

    fireEvent.click(screen.getByRole('option', { name: 'MonthM' }));
    expect(props.onViewChange).toHaveBeenCalledWith('month');
  });

  it('shows every view with its shortcut when all are available', () => {
    renderHeader();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'toolbar.view' }), {
      key: 'Enter',
    });
    for (const [value, key] of [
      ['day', 'D'],
      ['4-days', '4'],
      ['week', 'W'],
      ['month', 'M'],
      ['year', 'Y'],
      ['agenda', 'A'],
    ]) {
      expect(
        screen.getByTestId(`calendar-view-shortcut-${value}`).textContent
      ).toBe(key);
    }
  });
});

describe('nextHalfHourOn', () => {
  const zone = 'Asia/Ho_Chi_Minh';
  const viewed = new Date(2026, 10, 20);

  it('uses the next half hour of the zone wall clock on the viewed day', () => {
    // 10:10 in Ho Chi Minh City.
    const now = new Date('2026-11-14T03:10:00.000Z');
    expect(nextHalfHourOn(viewed, now, zone).toISOString()).toBe(
      '2026-11-20T03:30:00.000Z'
    );
  });

  it('moves an exact half hour to the following slot', () => {
    const now = new Date('2026-11-14T03:30:00.000Z');
    expect(nextHalfHourOn(viewed, now, zone).toISOString()).toBe(
      '2026-11-20T04:00:00.000Z'
    );
  });

  it('keeps late-evening events on the viewed day', () => {
    // 23:45 in Ho Chi Minh City.
    const now = new Date('2026-11-14T16:45:00.000Z');
    expect(nextHalfHourOn(viewed, now, zone).toISOString()).toBe(
      '2026-11-20T16:30:00.000Z'
    );
  });
});
