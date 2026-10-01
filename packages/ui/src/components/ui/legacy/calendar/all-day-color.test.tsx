import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    openModal: vi.fn(),
    updateEvent: vi.fn(),
    addEvent: vi.fn(),
    deleteEvent: vi.fn(),
  }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  useCalendarSync: () => ({
    allDayEvents: [
      {
        id: 'cutoff',
        title: 'Cut-off event',
        start_at: '2026-09-06T00:00:00Z',
        end_at: '2026-09-09T00:00:00Z',
        color: 'BLUE',
        scheduling_metadata: {
          google_color: { version: 1, inherited: false, background: '#00ff88' },
        },
      },
    ],
  }),
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

it('keeps an opaque all-day fill and contrasting dashed cut-off edge', () => {
  render(<AllDayEventBar dates={[new Date('2026-09-07T00:00:00Z')]} />);
  const card = screen.getByText('Cut-off event').closest('.border-dashed');
  expect(card).toHaveStyle({
    backgroundColor: '#00ff88',
    color: '#000000',
    borderColor: '#000000',
  });
});
