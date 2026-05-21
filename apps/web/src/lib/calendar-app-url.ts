import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getCalendarAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'calendar',
    candidates: [
      process.env.CALENDAR_APP_URL,
      process.env.NEXT_PUBLIC_CALENDAR_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://calendar.tuturuuu.com'
        : getLocalInternalAppUrl('calendar', 'http://localhost:7806'),
  });
}
