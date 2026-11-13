import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

// Re-export shared constants from satellite package
export {
  DEV_MODE,
  LOCALE_COOKIE_NAME,
  PROD_MODE,
  PUBLIC_PATHS,
  SHOW_TAILWIND_INDICATOR,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

// App-specific constants
export const PORT = process.env.PORT || 7806;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_CALENDAR_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://calendar.tuturuuu.com'
    : getLocalInternalAppUrl('calendar', `http://localhost:${PORT}`);
const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

const calendarUrlCandidates = [
  process.env.CALENDAR_APP_URL,
  process.env.NEXT_PUBLIC_CALENDAR_APP_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.BASE_URL,
];
function resolveCalendarAppUrl() {
  for (const candidate of calendarUrlCandidates) {
    if (
      process.env.CALENDAR_DEPLOYMENT_PROFILE === 'production' &&
      (candidate?.trim() === 'https://tuturuuu.com/calendar' ||
        candidate?.trim() === 'https://tuturuuu.com/calendar/')
    ) {
      return 'https://tuturuuu.com/calendar';
    }

    const resolved = resolveInternalAppUrl({
      appName: 'calendar',
      candidates: [candidate],
      fallback: '',
    });
    if (resolved) return resolved;
  }

  return resolveInternalAppUrl({
    appName: 'calendar',
    candidates: [],
    fallback: DEFAULT_CALENDAR_APP_URL,
  });
}

export const BASE_URL = resolveCalendarAppUrl();

export const API_URL = process.env.API_URL || `${BASE_URL}/api`;

export const TTR_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.TTR_URL,
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});
