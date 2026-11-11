import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCalendarAppOrigin } from './calendar-app-url';

afterEach(() => vi.unstubAllEnvs());

describe('getCalendarAppOrigin', () => {
  it('keeps the subdomain by default in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CALENDAR_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_CALENDAR_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
    expect(getCalendarAppOrigin()).toBe('https://calendar.tuturuuu.com');
  });

  it('uses the apex base path once calendar is an active mount', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CALENDAR_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_CALENDAR_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'tasks, calendar');
    expect(getCalendarAppOrigin()).toBe('https://tuturuuu.com/calendar');
  });

  it('lets an explicit configured URL win, including a mount base path', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
    vi.stubEnv('CALENDAR_APP_URL', 'https://calendar.tuturuuu.com/');
    expect(getCalendarAppOrigin()).toBe('https://calendar.tuturuuu.com');
  });
});
