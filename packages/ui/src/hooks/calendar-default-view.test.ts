import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_DEFAULT_VIEW_STORAGE_KEY,
  CALENDAR_LAST_VIEW_STORAGE_KEY,
  parseCalendarDefaultViewPreference,
  readInitialCalendarView,
  resolveInitialCalendarView,
} from './calendar-default-view';

describe('resolveInitialCalendarView', () => {
  it.each([
    [false, 'week'],
    [true, 'agenda'],
  ] as const)('opens auto with isMobile=%s as %s', (isMobile, view) => {
    expect(
      resolveInitialCalendarView({
        preference: 'auto',
        lastView: 'month',
        isMobile,
      })
    ).toBe(view);
  });

  it.each([
    ['day', false, 'day'],
    ['week', false, 'week'],
    ['month', true, 'month'],
    ['agenda', false, 'agenda'],
    ['week', true, 'agenda'],
  ] as const)(
    'opens an explicit %s preference (isMobile=%s) as %s',
    (preference, isMobile, view) => {
      expect(
        resolveInitialCalendarView({ preference, lastView: 'day', isMobile })
      ).toBe(view);
    }
  );

  it.each([
    ['month', false, 'month'],
    ['4-days', true, 'agenda'],
    ['unknown', false, 'week'],
    [null, true, 'agenda'],
  ] as const)(
    'opens the last view %s (isMobile=%s) as %s',
    (lastView, isMobile, view) => {
      expect(
        resolveInitialCalendarView({ preference: 'last', lastView, isMobile })
      ).toBe(view);
    }
  );

  it('treats a missing or unknown preference as auto', () => {
    expect(parseCalendarDefaultViewPreference(null)).toBe('auto');
    expect(parseCalendarDefaultViewPreference('year')).toBe('auto');
    expect(parseCalendarDefaultViewPreference('agenda')).toBe('agenda');
  });
});

describe('readInitialCalendarView', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('reads the browser mirror and viewport width', () => {
    vi.stubGlobal('innerWidth', 1024);
    expect(readInitialCalendarView()).toBe('week');
    vi.stubGlobal('innerWidth', 390);
    expect(readInitialCalendarView()).toBe('agenda');
    localStorage.setItem(CALENDAR_DEFAULT_VIEW_STORAGE_KEY, 'last');
    localStorage.setItem(CALENDAR_LAST_VIEW_STORAGE_KEY, 'month');
    expect(readInitialCalendarView()).toBe('month');
  });
});
