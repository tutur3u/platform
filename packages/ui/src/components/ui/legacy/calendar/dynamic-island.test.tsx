import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    getCurrentEvents: () => [],
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
          foreground: '#000000',
          resolution: 'event',
        },
      },
    }),
    isEditing: () => false,
  }),
}));

import { DynamicIsland } from './dynamic-island';

it('renders the upcoming provider color as an opaque fill', () => {
  render(<DynamicIsland />);
  const card = screen.getByText('Upcoming provider event').closest('.border');
  expect(card).toHaveStyle({ backgroundColor: '#fbd75b', color: '#000000' });
  expect(card).toHaveClass('opacity-100');
});
