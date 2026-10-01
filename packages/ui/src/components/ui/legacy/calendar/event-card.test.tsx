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
  hoveredBaseEventId: null as string | null,
  hoveredEventColumn: null as number | null,
  preservePastEventOpacity: true,
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
    hoveredBaseEventId: calendarMocks.hoveredBaseEventId,
    hoveredEventColumn: calendarMocks.hoveredEventColumn,
    isEventReadOnly: calendarMocks.isEventReadOnly,
    openModal: calendarMocks.openModal,
    preservePastEventOpacity: calendarMocks.preservePastEventOpacity,
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
    calendarMocks.hoveredBaseEventId = null;
    calendarMocks.hoveredEventColumn = null;
    calendarMocks.preservePastEventOpacity = true;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it('renders opaque RGB and contrast text on a timed event', () => {
    renderEventCard({
      id: 'rgb',
      title: 'RGB event',
      color: 'BLUE',
      start_at: '2026-06-26T08:30:00.000Z',
      end_at: '2026-06-26T09:30:00.000Z',
      scheduling_metadata: {
        google_color: { version: 1, inherited: false, background: '#00ff88' },
      },
    });
    const card = screen.getByTestId('calendar-event-rgb');
    expect(card.style.backgroundColor).toBe('rgb(0, 255, 136)');
    expect(card.style.color).toBe('rgb(0, 0, 0)');
    expect(card.style.opacity).toBe('1');
  });

  it('keeps pending and past fills opaque, and reveals lower stacks by hiding upper cards', () => {
    calendarMocks.preservePastEventOpacity = false;
    calendarMocks.hoveredBaseEventId = 'base';
    calendarMocks.hoveredEventColumn = 0;
    const base = {
      id: 'stack',
      title: 'Stack',
      color: 'BLUE' as const,
      start_at: '2026-06-26T08:30:00.000Z',
      end_at: '2026-06-26T09:30:00.000Z',
      _column: 1,
      _overlapCount: 2,
      _overlapGroup: ['base', 'stack'],
      _optimisticStatus: 'updating',
      scheduling_metadata: {
        google_color: { version: 1, inherited: false, background: '#00ff88' },
      },
    };
    const rendered = renderEventCard(base);
    const card = screen.getByTestId('calendar-event-stack');
    expect(card.style.opacity).toBe('1');
    expect(card.style.visibility).toBe('hidden');
    expect(card.style.backgroundColor).toBe('rgb(0, 255, 136)');
    expect(card.className).not.toMatch(/opacity-(?:30|50|60|80)/);
    rendered.unmount();
    calendarMocks.hoveredBaseEventId = null;
    calendarMocks.hoveredEventColumn = null;
    renderEventCard(base);
    expect(screen.getByTestId('calendar-event-stack').style.visibility).toBe(
      'visible'
    );
    expect(screen.getByTestId('calendar-event-stack').style.opacity).toBe('1');
  });

  it.each(['drag', 'resize'] as const)(
    'keeps provider fill and text opaque during %s pickup',
    (interaction) => {
      calendarMocks.isEventReadOnly.mockReturnValueOnce(false);
      const { container } = renderEventCard({
        id: 'interaction',
        title: 'Interactive RGB',
        color: 'BLUE',
        start_at: '2026-06-26T08:30:00.000Z',
        end_at: '2026-06-26T09:30:00.000Z',
        scheduling_metadata: {
          google_color: { version: 1, inherited: false, background: '#00ff88' },
        },
      });
      const card = screen.getByTestId('calendar-event-interaction');
      const handle =
        interaction === 'resize'
          ? container.querySelector('.cursor-s-resize')!
          : screen.getByText('Interactive RGB');
      fireEvent.mouseDown(handle, { button: 0, clientX: 20, clientY: 20 });
      expect(card).toHaveClass('shadow-md');
      expect(card.style.backgroundColor).toBe('rgb(0, 255, 136)');
      expect(card.style.color).toBe('rgb(0, 0, 0)');
      expect(card.style.opacity).toBe('1');
      expect(card.className).not.toMatch(/opacity-(?:30|50|60|80)/);
      fireEvent.mouseUp(window, { clientX: 20, clientY: 20 });
      expect(calendarMocks.updateEvent).not.toHaveBeenCalled();
    }
  );

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
      'outline-dashed'
    );
  });
});
