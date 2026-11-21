import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const event = (id: string) => ({
  id,
  title: `Event ${id}`,
  start_at: '2026-09-07T00:00:00Z',
  end_at: '2026-09-08T00:00:00Z',
  color: 'BLUE',
});

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    openModal: vi.fn(),
    updateEvent: vi.fn(),
    addEvent: vi.fn(),
    deleteEvent: vi.fn(),
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  useCalendarSync: () => ({ allDayEvents: ['a', 'b', 'c'].map(event) }),
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
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));

import { AllDayEventBar } from './all-day-event-bar';

it('keeps an overflowing day to two rows with a reachable +N toggle', () => {
  const { container } = render(
    <AllDayEventBar dates={[new Date('2026-09-07T00:00:00Z')]} />
  );
  const lane = container.querySelector<HTMLElement>('[style*="height"]');
  const toggle = screen.getByRole('button', { name: /all_day_more:2/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // The toggle sits inside the lane's height, so overflow never clips it.
  expect(Number.parseFloat(toggle.style.top) + 1.5).toBeLessThanOrEqual(
    Number.parseFloat(lane!.style.height)
  );
  expect(screen.getAllByText(/^Event /)).toHaveLength(1);

  fireEvent.click(toggle);
  expect(screen.getAllByText(/^Event /)).toHaveLength(3);
  expect(
    screen.getByRole('button', { name: 'all_day_show_less' })
  ).toHaveAttribute('aria-expanded', 'true');
});
