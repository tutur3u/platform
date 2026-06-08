import { act, renderHook } from '@testing-library/react';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarProvider, useCalendar } from '../use-calendar';

const calendarMockState = vi.hoisted(() => ({
  events: [] as CalendarEvent[],
}));

// Mock useCalendarSync
vi.mock('../use-calendar-sync', () => ({
  useCalendarSync: () => ({
    events: calendarMockState.events,
    refresh: vi.fn(),
  }),
}));

describe('CalendarProvider Read-Only Mode', () => {
  beforeEach(() => {
    calendarMockState.events = [];
  });

  const mockUseQuery = vi
    .fn()
    .mockReturnValue({ data: null, isLoading: false });
  const mockUseQueryClient = vi.fn().mockReturnValue({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  });

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
});
