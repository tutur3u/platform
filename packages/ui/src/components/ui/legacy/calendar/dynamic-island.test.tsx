import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  current: false,
  id: 'first',
  end: '2026-10-01T11:00:00Z',
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    getCurrentEvents: () =>
      state.current
        ? [
            {
              id: state.id,
              title: 'Current RGB',
              start_at: '2026-10-01T09:00:00Z',
              end_at: state.end,
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
  state.id = 'first';
  state.end = '2026-10-01T11:00:00Z';
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

it('starts, ticks, stops and restarts the same event, and cleans up on unmount', () => {
  vi.useFakeTimers();
  state.current = true;
  const view = render(<DynamicIsland />);
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('30m')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('29m 59s')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Focused work')).toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('30m')).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('resets when event identity or deadline changes and removes stale state when events end', () => {
  vi.useFakeTimers();
  state.current = true;
  const view = render(<DynamicIsland />);
  fireEvent.click(screen.getByRole('button'));
  state.id = 'second';
  view.rerender(<DynamicIsland />);
  expect(screen.getByText('Focused work')).toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('button'));
  state.end = '2026-10-01T09:40:00Z';
  view.rerender(<DynamicIsland />);
  expect(screen.getByText('1 cycles')).toBeInTheDocument();
  state.current = false;
  view.rerender(<DynamicIsland />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
});

it('finishes the last cycle once without leaving an interval running', () => {
  vi.useFakeTimers();
  state.current = true;
  state.end = '2026-10-01T09:30:01Z';
  const play = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    'Audio',
    class {
      play = play;
    }
  );
  render(<DynamicIsland />);
  fireEvent.click(screen.getByRole('button'));
  act(() => vi.advanceTimersByTime(1000));
  expect(play).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Cycle #/)).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
});
