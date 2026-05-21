import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCalendarAppOrigin: vi.fn(() => 'https://calendar.tuturuuu.com'),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@/lib/calendar-app-url', () => ({
  getCalendarAppOrigin: mocks.getCalendarAppOrigin,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

describe('web Calendar canonical redirect', () => {
  it('redirects to the Calendar app origin with the workspace and query string', async () => {
    const CalendarPage = (await import('./page')).default;

    await expect(
      CalendarPage({
        params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
        searchParams: Promise.resolve({
          filter: ['mine', 'team'],
          view: 'week',
        }),
      })
    ).rejects.toThrow(
      'redirect:https://calendar.tuturuuu.com/personal?filter=mine&filter=team&view=week'
    );

    expect(mocks.getCalendarAppOrigin).toHaveBeenCalled();
  });
});
