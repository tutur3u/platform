import { getAppProductionBaseUrl } from '@tuturuuu/utils/app-mounts';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

const CALENDAR_SUBDOMAIN_URL = 'https://calendar.tuturuuu.com';

/**
 * Base URL of the Calendar app, with no trailing slash; callers append paths.
 * `https://calendar.tuturuuu.com` unless `calendar` is listed in
 * `NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS`, then `https://tuturuuu.com/calendar`.
 * An explicit `CALENDAR_APP_URL` still wins.
 */
export function getCalendarAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'calendar',
    candidates: [
      process.env.CALENDAR_APP_URL,
      process.env.NEXT_PUBLIC_CALENDAR_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? getAppProductionBaseUrl('calendar', CALENDAR_SUBDOMAIN_URL)
        : getLocalInternalAppUrl('calendar', 'http://localhost:7806'),
  });
}
