import type { CalendarView } from './use-view-transition';

/** Per-user config key for the calendar's opening view. */
export const CALENDAR_DEFAULT_VIEW_CONFIG_ID = 'CALENDAR_DEFAULT_VIEW';
/** Same-browser mirror of the preference, read synchronously on load. */
export const CALENDAR_DEFAULT_VIEW_STORAGE_KEY = 'calendar-default-view';
/** The view the user last picked, used by the `last` preference. */
export const CALENDAR_LAST_VIEW_STORAGE_KEY = 'calendar-view-mode';
/** Viewports narrower than this open the mobile default (useIsMobile). */
export const CALENDAR_MOBILE_MAX_WIDTH = 767;

export const CALENDAR_DEFAULT_VIEW_PREFERENCES = [
  'auto',
  'last',
  'day',
  'week',
  'month',
  'agenda',
] as const;

export type CalendarDefaultViewPreference =
  (typeof CALENDAR_DEFAULT_VIEW_PREFERENCES)[number];

const CALENDAR_VIEWS: readonly CalendarView[] = [
  'day',
  '4-days',
  'week',
  'month',
  'year',
  'agenda',
];

export function parseCalendarDefaultViewPreference(
  value: string | null | undefined
): CalendarDefaultViewPreference {
  return (
    CALENDAR_DEFAULT_VIEW_PREFERENCES.find((item) => item === value) ?? 'auto'
  );
}

function parseCalendarView(value: string | null | undefined) {
  return CALENDAR_VIEWS.find((item) => item === value) ?? null;
}

/** Multi-day time grids do not fit a phone; agenda carries the same days. */
function fitViewport(view: CalendarView, isMobile: boolean): CalendarView {
  return isMobile && (view === 'week' || view === '4-days') ? 'agenda' : view;
}

/**
 * The view a calendar opens with: week on tablet and desktop and agenda on
 * phones by default, an explicitly chosen view, or the last view picked.
 */
export function resolveInitialCalendarView({
  preference,
  lastView,
  isMobile,
}: {
  preference: CalendarDefaultViewPreference;
  lastView: string | null | undefined;
  isMobile: boolean;
}): CalendarView {
  switch (preference) {
    case 'auto':
      return isMobile ? 'agenda' : 'week';
    case 'last':
      return fitViewport(
        parseCalendarView(lastView) ?? (isMobile ? 'agenda' : 'week'),
        isMobile
      );
    case 'day':
    case 'week':
    case 'month':
    case 'agenda':
      return fitViewport(preference, isMobile);
    default: {
      const unreachable: never = preference;
      return unreachable;
    }
  }
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Reads the browser's preference mirror and viewport (client only). */
export function readInitialCalendarView(): CalendarView {
  return resolveInitialCalendarView({
    preference: parseCalendarDefaultViewPreference(
      readStorage(CALENDAR_DEFAULT_VIEW_STORAGE_KEY)
    ),
    lastView: readStorage(CALENDAR_LAST_VIEW_STORAGE_KEY),
    isMobile: window.innerWidth <= CALENDAR_MOBILE_MAX_WIDTH,
  });
}

export function writeCalendarDefaultViewMirror(
  preference: CalendarDefaultViewPreference
) {
  try {
    localStorage.setItem(CALENDAR_DEFAULT_VIEW_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the account value remains.
  }
}
