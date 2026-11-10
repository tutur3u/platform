import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CalendarLoadingSkeleton } from './calendar-loading-skeleton';
import { DAY_HEIGHT } from './config';

const days = (count: number) =>
  Array.from({ length: count }, (_, i) => new Date(2026, 5, 22 + i));

describe('calendar loading skeleton geometry', () => {
  it('holds only the time grid for timed views', () => {
    // The weekday bar is always mounted above the scroll area, so a second
    // header row here would vanish when the grid arrives and shift it upward.
    const { container } = render(
      <CalendarLoadingSkeleton dates={days(7)} view="week" />
    );
    const root = container.querySelector('[aria-busy="true"]');
    expect(root?.children).toHaveLength(1);
  });

  it('matches the real grid column count and day height', () => {
    const { container } = render(
      <CalendarLoadingSkeleton dates={days(4)} view="4-days" />
    );
    const grid = container.querySelector<HTMLElement>('.relative.grid');
    expect(grid?.style.gridTemplateColumns).toContain('repeat(4,');
    expect(grid?.style.height).toBe(`${DAY_HEIGHT}px`);
  });
});
