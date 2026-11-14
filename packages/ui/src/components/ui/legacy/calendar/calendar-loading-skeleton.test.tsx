import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import { CALENDAR_HEADER_HEIGHT_CLASS } from './calendar-header';
import {
  CalendarFirstPaintSkeleton,
  CalendarHeaderSkeleton,
  CalendarLoadingSkeleton,
} from './calendar-loading-skeleton';

function columns() {
  return screen.queryAllByTestId('calendar-skeleton-column');
}

describe('CalendarFirstPaintSkeleton', () => {
  it.each([
    ['day', 1],
    ['4-days', 4],
    ['week', 7],
  ] as [CalendarView, number][])(
    'draws the header row and %s with %i time columns',
    (view, count) => {
      render(<CalendarFirstPaintSkeleton view={view} />);
      expect(screen.getByTestId('calendar-header-skeleton')).toBeTruthy();
      expect(columns()).toHaveLength(count);
    }
  );

  it('collapses wide time grids to one column below md with CSS only', () => {
    render(<CalendarFirstPaintSkeleton view="week" />);
    const [first, ...rest] = columns();
    expect(first?.className).not.toContain('max-md:hidden');
    for (const column of rest)
      expect(column.className).toContain('max-md:hidden');
    // No pixel minimum width, which would force horizontal scrolling on phones.
    const grid = first?.parentElement?.parentElement;
    expect(grid?.getAttribute('style') ?? '').not.toContain('min-width');
  });

  it('uses the month layout for month and year without time columns', () => {
    const { container } = render(<CalendarFirstPaintSkeleton view="month" />);
    expect(columns()).toHaveLength(0);
    expect(container.querySelector('[style*="repeat(7"]')).toBeTruthy();
  });

  it('keeps the same outer grid template as the resolved calendar', () => {
    render(<CalendarFirstPaintSkeleton view="week" />);
    const root = screen.getByTestId('calendar-first-paint-skeleton');
    expect(root.className).toContain('h-full');
    expect(root.className).toContain('min-h-0');
    expect(root.className).toContain('grid-rows-[auto_auto_1fr]');
    expect(root.getAttribute('aria-busy')).toBe('true');
    const weekdays = screen.getByTestId('calendar-weekday-bar-skeleton');
    expect(weekdays.textContent).toBe('');
    expect(weekdays.nextElementSibling?.getAttribute('data-slot')).toBe(
      'calendar-body'
    );
  });

  it('reserves no weekday bar for month, year and agenda', () => {
    for (const view of ['month', 'year', 'agenda'] as CalendarView[]) {
      const { unmount } = render(<CalendarFirstPaintSkeleton view={view} />);
      const root = screen.getByTestId('calendar-first-paint-skeleton');
      expect(root.className).toContain('grid-rows-[auto_1fr]');
      expect(screen.queryByTestId('calendar-weekday-bar-skeleton')).toBeNull();
      unmount();
    }
  });
});

describe('CalendarHeaderSkeleton', () => {
  it('is one text-free row at the header height with the header control slots', () => {
    render(<CalendarHeaderSkeleton />);
    const header = screen.getByTestId('calendar-header-skeleton');
    expect(header.className).toContain(CALENDAR_HEADER_HEIGHT_CLASS);
    expect(header.className).not.toMatch(/flex-col|\bmb-/);
    expect(header.textContent).toBe('');
    expect(header.getAttribute('aria-hidden')).toBe('true');
    // Previous, next, Today, title, view picker and the "+ New" split button.
    expect(header.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7);
  });
});

describe('CalendarLoadingSkeleton', () => {
  it('matches the loaded date count and keeps the desktop minimum width', () => {
    const dates = Array.from(
      { length: 5 },
      (_, day) => new Date(2026, 10, day + 2)
    );
    render(<CalendarLoadingSkeleton dates={dates} view="week" />);
    const all = columns();
    expect(all).toHaveLength(5);
    for (const column of all)
      expect(column.className).not.toContain('max-md:hidden');
  });

  it('uses semantic tokens only', () => {
    const { container } = render(
      <>
        <CalendarFirstPaintSkeleton view="week" />
        <CalendarLoadingSkeleton dates={[]} view="month" />
      </>
    );
    expect(container.innerHTML).not.toMatch(/zinc|neutral|slate|gray-\d/);
  });
});
