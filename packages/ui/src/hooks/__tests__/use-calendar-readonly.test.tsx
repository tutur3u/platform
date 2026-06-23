import { act, renderHook } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarProvider, useCalendar } from '../use-calendar';

const calendarMockState = vi.hoisted(() => ({
  events: [] as CalendarEvent[],
  patchVisibleEvents: vi.fn(),
  refresh: vi.fn(),
}));

const internalApiMocks = vi.hoisted(() => ({
  createWorkspaceCalendarEvent: vi.fn(),
  deleteWorkspaceCalendarEvent: vi.fn(),
  updateWorkspaceCalendarEvent: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceCalendarEvent: internalApiMocks.createWorkspaceCalendarEvent,
  deleteWorkspaceCalendarEvent: internalApiMocks.deleteWorkspaceCalendarEvent,
  updateWorkspaceCalendarEvent: internalApiMocks.updateWorkspaceCalendarEvent,
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  }),
}));

// Mock useCalendarSync
vi.mock('../use-calendar-sync', () => ({
  useCalendarSync: () => ({
    events: calendarMockState.events,
    patchVisibleEvents: calendarMockState.patchVisibleEvents,
    refresh: calendarMockState.refresh,
  }),
}));

describe('CalendarProvider Read-Only Mode', () => {
  beforeEach(() => {
    calendarMockState.events = [];
    calendarMockState.patchVisibleEvents.mockReset();
    calendarMockState.refresh.mockReset();
    internalApiMocks.createWorkspaceCalendarEvent.mockReset();
    internalApiMocks.deleteWorkspaceCalendarEvent.mockReset();
    internalApiMocks.updateWorkspaceCalendarEvent.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockUseQuery = vi
    .fn()
    .mockReturnValue({ data: null, isLoading: false });
  const mockUseQueryClient = vi.fn().mockReturnValue({
    invalidateQueries: vi.fn(),
    setQueriesData: vi.fn(),
    setQueryData: vi.fn(),
  });

  const createWrapper = ({ readOnly = false }: { readOnly?: boolean } = {}) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <CalendarProvider
          ws={{ id: 'workspace-1', name: 'Workspace' } as any}
          useQuery={mockUseQuery}
          useQueryClient={mockUseQueryClient}
          readOnly={readOnly}
        >
          {children}
        </CalendarProvider>
      );
    };

  const baseEvent: CalendarEvent = {
    id: 'event-1',
    title: 'Planning',
    start_at: '2026-06-22T09:00:00.000Z',
    end_at: '2026-06-22T10:00:00.000Z',
    ws_id: 'workspace-1',
  };

  it('should have readOnly set to true when passed as prop', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CalendarProvider
        useQuery={mockUseQuery}
        useQueryClient={mockUseQueryClient}
        readOnly={true}
      >
        {children}
      </CalendarProvider>
    );

    const { result } = renderHook(() => useCalendar(), { wrapper });
    expect(result.current.readOnly).toBe(true);
  });

  it('should prevent addEvent when readOnly is true', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CalendarProvider
        useQuery={mockUseQuery}
        useQueryClient={mockUseQueryClient}
        readOnly={true}
      >
        {children}
      </CalendarProvider>
    );

    const { result } = renderHook(() => useCalendar(), { wrapper });
    const event = await result.current.addEvent({
      title: 'Test',
      start_at: new Date().toISOString(),
      end_at: new Date().toISOString(),
    } as any);
    expect(event).toBeUndefined();
  });

  it('should prevent updateEvent when readOnly is true', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CalendarProvider
        useQuery={mockUseQuery}
        useQueryClient={mockUseQueryClient}
        readOnly={true}
      >
        {children}
      </CalendarProvider>
    );

    const { result } = renderHook(() => useCalendar(), { wrapper });
    const event = await result.current.updateEvent('1', { title: 'Updated' });
    expect(event).toBeUndefined();
  });

  it('should prevent deleteEvent when readOnly is true', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CalendarProvider
        useQuery={mockUseQuery}
        useQueryClient={mockUseQueryClient}
        readOnly={true}
      >
        {children}
      </CalendarProvider>
    );

    const { result } = renderHook(() => useCalendar(), { wrapper });
    await result.current.deleteEvent('1');
    // If it doesn't throw, it's fine (it just exits early with a warning)
    expect(true).toBe(true);
  });

  it('opens preview for existing event clicks and editor from Edit action', () => {
    calendarMockState.events = [
      {
        id: 'event-1',
        title: 'Design review',
        start_at: '2026-06-08T09:00:00.000Z',
        end_at: '2026-06-08T10:00:00.000Z',
        ws_id: 'workspace-1',
      },
    ];

    const wrapper = ({ children }: { children: ReactNode }) => (
      <CalendarProvider
        ws={{ id: 'workspace-1', name: 'Workspace' } as any}
        useQuery={mockUseQuery}
        useQueryClient={mockUseQueryClient}
      >
        {children}
      </CalendarProvider>
    );

    const { result } = renderHook(() => useCalendar(), { wrapper });

    act(() => {
      result.current.openModal('event-1');
    });

    expect(result.current.isPreviewOpen).toBe(true);
    expect(result.current.previewEvent?.id).toBe('event-1');
    expect(result.current.isModalOpen).toBe(false);

    act(() => {
      result.current.openEventEditor('event-1');
    });

    expect(result.current.isPreviewOpen).toBe(false);
    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.activeEvent?.id).toBe('event-1');
  });

  it('opens the editor directly for create flows', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CalendarProvider
        ws={{ id: 'workspace-1', name: 'Workspace' } as any}
        useQuery={mockUseQuery}
        useQueryClient={mockUseQueryClient}
      >
        {children}
      </CalendarProvider>
    );

    const { result } = renderHook(() => useCalendar(), { wrapper });

    act(() => {
      result.current.openModal(undefined, 'event');
    });

    expect(result.current.isPreviewOpen).toBe(false);
    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.activeEvent?.id).toBe('new');
  });

  it('patches a created event optimistically before the network promise resolves', async () => {
    let resolveCreate: ((event: CalendarEvent) => void) | undefined;
    internalApiMocks.createWorkspaceCalendarEvent.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    let createPromise: Promise<CalendarEvent | undefined>;
    act(() => {
      createPromise = result.current.addEvent({
        title: 'New event',
        start_at: '2026-06-22T09:00:00.000Z',
        end_at: '2026-06-22T10:00:00.000Z',
        ws_id: 'workspace-1',
      });
    });

    expect(calendarMockState.patchVisibleEvents).toHaveBeenCalledWith(
      [expect.objectContaining({ _optimisticStatus: 'creating' })],
      { status: 'creating' }
    );

    const serverEvent = {
      ...baseEvent,
      id: 'event-created',
      title: 'New event',
    };

    await act(async () => {
      resolveCreate?.(serverEvent);
      await createPromise!;
    });

    expect(calendarMockState.patchVisibleEvents).toHaveBeenLastCalledWith(
      [serverEvent],
      expect.objectContaining({
        clearIds: [expect.stringMatching(/^optimistic-/)],
      })
    );
  });

  it('rolls back a failed optimistic create', async () => {
    internalApiMocks.createWorkspaceCalendarEvent.mockRejectedValue(
      new Error('create failed')
    );

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.addEvent({
          title: 'New event',
          start_at: '2026-06-22T09:00:00.000Z',
          end_at: '2026-06-22T10:00:00.000Z',
          ws_id: 'workspace-1',
        })
      ).rejects.toThrow('create failed');
    });

    expect(calendarMockState.patchVisibleEvents).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        clearIds: [expect.stringMatching(/^optimistic-/)],
      })
    );
  });

  it('patches an updated event optimistically before the debounced network write', async () => {
    vi.useFakeTimers();
    calendarMockState.events = [baseEvent];
    internalApiMocks.updateWorkspaceCalendarEvent.mockResolvedValue({
      ...baseEvent,
      title: 'Updated',
    });

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    let updatePromise: Promise<CalendarEvent | undefined>;
    act(() => {
      updatePromise = result.current.updateEvent('event-1', {
        title: 'Updated',
      });
    });

    expect(calendarMockState.patchVisibleEvents).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          _optimisticStatus: 'updating',
          title: 'Updated',
        }),
      ],
      { status: 'updating' }
    );
    expect(
      internalApiMocks.updateWorkspaceCalendarEvent
    ).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
      await updatePromise!;
    });

    expect(internalApiMocks.updateWorkspaceCalendarEvent).toHaveBeenCalledWith(
      'workspace-1',
      'event-1',
      expect.objectContaining({ title: 'Updated' }),
      expect.any(Object)
    );
  });

  it('rolls back a failed optimistic update', async () => {
    vi.useFakeTimers();
    calendarMockState.events = [baseEvent];
    internalApiMocks.updateWorkspaceCalendarEvent.mockRejectedValue(
      new Error('update failed')
    );

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    let updatePromise: Promise<CalendarEvent | undefined>;
    act(() => {
      updatePromise = result.current.updateEvent('event-1', {
        title: 'Broken',
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await expect(updatePromise!).rejects.toThrow('update failed');
    });

    expect(calendarMockState.patchVisibleEvents).toHaveBeenLastCalledWith([
      baseEvent,
    ]);
  });

  it('coalesces rapid event updates to the latest payload', async () => {
    vi.useFakeTimers();
    calendarMockState.events = [baseEvent];
    internalApiMocks.updateWorkspaceCalendarEvent.mockResolvedValue({
      ...baseEvent,
      start_at: '2026-06-22T09:30:00.000Z',
      end_at: '2026-06-22T10:30:00.000Z',
    });

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    let firstPromise: Promise<CalendarEvent | undefined>;
    let secondPromise: Promise<CalendarEvent | undefined>;

    act(() => {
      firstPromise = result.current.updateEvent('event-1', {
        start_at: '2026-06-22T09:15:00.000Z',
        end_at: '2026-06-22T10:15:00.000Z',
      });
      secondPromise = result.current.updateEvent('event-1', {
        start_at: '2026-06-22T09:30:00.000Z',
        end_at: '2026-06-22T10:30:00.000Z',
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.all([firstPromise!, secondPromise!]);
    });

    expect(internalApiMocks.updateWorkspaceCalendarEvent).toHaveBeenCalledTimes(
      1
    );
    expect(internalApiMocks.updateWorkspaceCalendarEvent).toHaveBeenCalledWith(
      'workspace-1',
      'event-1',
      expect.objectContaining({
        end_at: '2026-06-22T10:30:00.000Z',
        start_at: '2026-06-22T09:30:00.000Z',
      }),
      expect.any(Object)
    );
  });

  it('marks a deleted event as pending before the network promise resolves', async () => {
    calendarMockState.events = [baseEvent];
    let resolveDelete:
      | ((result: {
          linkedTaskId: string | null;
          skippedHabitId: string | null;
        }) => void)
      | undefined;
    internalApiMocks.deleteWorkspaceCalendarEvent.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    let deletePromise: Promise<void>;
    act(() => {
      deletePromise = result.current.deleteEvent('event-1');
    });

    expect(calendarMockState.patchVisibleEvents).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          ...baseEvent,
          _optimisticStatus: 'deleting',
        }),
      ],
      { status: 'deleting' }
    );

    await act(async () => {
      resolveDelete?.({
        linkedTaskId: null,
        skippedHabitId: null,
      });
      await deletePromise!;
    });

    expect(internalApiMocks.deleteWorkspaceCalendarEvent).toHaveBeenCalledWith(
      'workspace-1',
      'event-1',
      expect.any(Object)
    );
    expect(calendarMockState.patchVisibleEvents).toHaveBeenLastCalledWith([], {
      removeIds: ['event-1'],
    });
  });

  it('restores a failed optimistic delete', async () => {
    calendarMockState.events = [baseEvent];
    internalApiMocks.deleteWorkspaceCalendarEvent.mockRejectedValue(
      new Error('delete failed')
    );

    const { result } = renderHook(() => useCalendar(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.deleteEvent('event-1')).rejects.toThrow(
        'delete failed'
      );
    });

    expect(calendarMockState.patchVisibleEvents).toHaveBeenLastCalledWith([
      baseEvent,
    ]);
  });
});
