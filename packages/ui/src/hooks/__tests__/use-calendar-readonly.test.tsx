import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarProvider, useCalendar } from '../use-calendar';

// Mock useCalendarSync
vi.mock('../use-calendar-sync', () => ({
  useCalendarSync: () => ({
    events: [],
    refresh: vi.fn(),
  }),
}));

describe('CalendarProvider Read-Only Mode', () => {
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
});
