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
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { AllDayEventBar } from './all-day-event-bar';

/** Inline declarations as authored; computed styles drop unresolved vars. */
function inlineStyle(element: Element | null) {
  const style = (element as HTMLElement).style;
  return {
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
    color: style.color,
  };
}

it('keeps a token all-day fill and foreground dashed cut-off edge', () => {
  render(<AllDayEventBar dates={[new Date('2026-09-07T00:00:00Z')]} />);
  const card = screen.getByText('Cut-off event').closest('.border-dashed');
  expect(inlineStyle(card)).toMatchObject({
    backgroundColor: 'color-mix(in oklab, var(--green) 18%, var(--background))',
    color: 'var(--foreground)',
    borderColor: 'var(--foreground)',
  });
});
