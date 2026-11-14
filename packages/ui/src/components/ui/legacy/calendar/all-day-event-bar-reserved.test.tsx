import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    openModal: vi.fn(),
    updateEvent: vi.fn(),
    addEvent: vi.fn(),
    deleteEvent: vi.fn(),
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  useCalendarSync: () => ({ allDayEvents: [], isPlaceholderData: false }),
}));
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: {
      appearance: { showWeekends: true },
      timezone: { timezone: 'UTC' },
    },
  }),
}));
vi.mock('./location-timeline', () => ({ LocationTimeline: () => null }));

import { AllDayEventBar } from './all-day-event-bar';
import {
  ALL_DAY_BAR_MIN_HEIGHT_REM,
  stableAllDayBarHeight,
} from './all-day-event-layout';

describe('all-day row reservation', () => {
  it('renders the empty row so arriving all-day events never push the grid', () => {
    const { container } = render(
      <AllDayEventBar dates={[new Date('2026-09-07T00:00:00Z')]} />
    );
    const row = container.firstElementChild as HTMLElement | null;
    expect(row).not.toBeNull();
    const body = row?.lastElementChild as HTMLElement;
    expect(body.style.height).toBe(`${ALL_DAY_BAR_MIN_HEIGHT_REM}rem`);
  });

  it('never shrinks below the settled height while rows are carried over', () => {
    expect(
      stableAllDayBarHeight({
        barHeight: 1.9,
        isPlaceholder: true,
        settledHeight: 5.4,
      })
    ).toBe(5.4);
    expect(
      stableAllDayBarHeight({
        barHeight: 1.9,
        isPlaceholder: false,
        settledHeight: 5.4,
      })
    ).toBe(1.9);
  });
});
