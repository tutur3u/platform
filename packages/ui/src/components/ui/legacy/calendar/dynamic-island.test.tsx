import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ current: false }));
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    getCurrentEvents: () =>
      state.current
        ? [
            {
              title: 'Current RGB',
              start_at: '2026-10-01T09:00:00Z',
              end_at: '2026-10-01T11:00:00Z',
              color: 'BLUE',
              scheduling_metadata: {
                google_color: {
                  version: 1,
                  inherited: false,
                  background: '#fbd75b',
                },
              },
            },
          ]
        : [],
    getUpcomingEvent: () => ({
      title: 'Upcoming provider event',
      start_at: '2026-10-01T10:00:00Z',
      color: 'BLUE',
      scheduling_metadata: {
        google_color: {
          version: 1,
          calendar_id: 'source',
          color_id: '4',
          event_label_id: null,
          inherited: false,
          background: '#fbd75b',
          resolution: 'event',
        },
      },
    }),
    isEditing: () => false,
  }),
}));

import { DynamicIsland } from './dynamic-island';

beforeEach(() => {
  state.current = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T09:30:00Z'));
});
afterEach(() => vi.useRealTimers());
it('renders the upcoming provider color as an opaque fill', () => {
  render(<DynamicIsland />);
  const card = screen.getByText('Upcoming provider event').closest('.border');
  expect(card).toHaveStyle({ backgroundColor: '#fbd75b', color: '#000000' });
  expect(card).toHaveClass('opacity-100');
});

it('uses matching provider fill and contrast on pomodoro controls and edge', () => {
  state.current = true;
  const { container } = render(<DynamicIsland />);
  const card = screen.getByText('Current RGB').closest('.border');
  expect(card).toHaveStyle({
    backgroundColor: '#fbd75b',
    borderColor: '#000000',
  });
  expect(screen.getByRole('button')).toHaveStyle({
    backgroundColor: '#fbd75b',
    color: '#000000',
    borderColor: '#000000',
  });
  expect(container.querySelector('[data-orientation="vertical"]')).toHaveStyle({
    backgroundColor: '#000000',
  });
});
