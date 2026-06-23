// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventCard } from './event-card';

dayjs.extend(utc);
dayjs.extend(timezone);

class ResizeObserverMock {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

const calendarMocks = vi.hoisted(() => ({
  deleteEvent: vi.fn(),
  hideModal: vi.fn(),
  isEventReadOnly: vi.fn(() => true),
  openModal: vi.fn(),
  setHoveredBaseEventId: vi.fn(),
  setHoveredEventColumn: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    affectedEventIds: new Set<string>(),
    deleteEvent: calendarMocks.deleteEvent,
    disableBuiltInEventUi: true,
    hideModal: calendarMocks.hideModal,
    hoveredBaseEventId: null,
    hoveredEventColumn: null,
    isEventReadOnly: calendarMocks.isEventReadOnly,
    openModal: calendarMocks.openModal,
    preservePastEventOpacity: true,
    readOnly: false,
    renderEventContextMenu: undefined,
    setHoveredBaseEventId: calendarMocks.setHoveredBaseEventId,
    setHoveredEventColumn: calendarMocks.setHoveredEventColumn,
    updateEvent: calendarMocks.updateEvent,
  }),
}));

vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: {
      appearance: { timeFormat: '24h' },
      timezone: { timezone: 'Asia/Ho_Chi_Minh' },
    },
  }),
}));

function renderEventCard(event: CalendarEvent) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <div className="calendar-cell" style={{ height: 1920, width: 240 }}>
        <EventCard
          dates={[new Date('2026-06-26T00:00:00.000Z')]}
          event={event}
          wsId="workspace-1"
        />
      </div>
    </QueryClientProvider>
  );
}

describe('EventCard read-only adapter events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it('opens read-only events but hides resize controls', () => {
    const { container } = renderEventCard({
      id: 'event-1',
      title: 'Read only session',
      start_at: '2026-06-26T08:30:00.000Z',
      end_at: '2026-06-26T09:30:00.000Z',
      ws_id: 'workspace-1',
    });

    expect(calendarMocks.isEventReadOnly).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1' })
    );
    expect(container.querySelector('.cursor-s-resize')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /read only session/i }));

    expect(calendarMocks.openModal).toHaveBeenCalledWith('event-1');
    expect(calendarMocks.updateEvent).not.toHaveBeenCalled();
  });

  it('shows a Google Calendar provider icon before synced event titles', () => {
    renderEventCard({
      id: 'event-google',
      title: 'Google sync',
      start_at: '2026-06-26T08:30:00.000Z',
      end_at: '2026-06-26T09:30:00.000Z',
      google_event_id: 'google-event-1',
      provider: 'google',
      ws_id: 'workspace-1',
    });

    expect(screen.getByTestId('google-calendar-logo')).toBeInTheDocument();
    expect(
      screen.queryByTestId('microsoft-outlook-logo')
    ).not.toBeInTheDocument();
  });

  it('shows a Microsoft Outlook provider icon before Microsoft synced event titles', () => {
    renderEventCard({
      id: 'event-microsoft',
      title: 'Outlook sync',
      start_at: '2026-06-26T08:30:00.000Z',
      end_at: '2026-06-26T09:30:00.000Z',
      external_event_id: 'outlook-event-1',
      provider: 'microsoft',
      ws_id: 'workspace-1',
    });

    expect(screen.getByTestId('microsoft-outlook-logo')).toBeInTheDocument();
    expect(
      screen.queryByTestId('google-calendar-logo')
    ).not.toBeInTheDocument();
  });

  it('does not show provider icons for local calendar events', () => {
    renderEventCard({
      id: 'event-local',
      title: 'Local event',
      start_at: '2026-06-26T08:30:00.000Z',
      end_at: '2026-06-26T09:30:00.000Z',
      provider: 'tuturuuu',
      ws_id: 'workspace-1',
    });

    expect(
      screen.queryByTestId('google-calendar-logo')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('microsoft-outlook-logo')
    ).not.toBeInTheDocument();
  });

  it('renders updating events as a subtle dashed pending card', () => {
    renderEventCard({
      id: 'event-updating',
      title: 'Updating event',
      start_at: '2026-06-26T08:30:00.000Z',
      end_at: '2026-06-26T09:30:00.000Z',
      ws_id: 'workspace-1',
      _optimisticStatus: 'updating',
    } as CalendarEvent & { _optimisticStatus: 'updating' });

    expect(screen.getByTestId('calendar-event-event-updating')).toHaveClass(
      'outline-dashed',
      'opacity-60'
    );
  });
});
