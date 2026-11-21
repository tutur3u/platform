import {
  type InternalApiAppBaseResolver,
  registerDefaultAppBaseResolver,
} from '@tuturuuu/internal-api/client';
import { calendarApiPath, isCalendarApiPath } from './calendar-api-path';

/**
 * Calendar proxies its own APIs and the Tasks APIs it embeds. Claiming them
 * through `owns` keeps cross-app task helper calls on Calendar's origin, so a
 * mounted page sends them same-origin with the session cookie.
 */
const calendarApiResolver: InternalApiAppBaseResolver = Object.assign(
  (path: string) => calendarApiPath(path),
  { owns: (pathname: string) => isCalendarApiPath(pathname) }
);

export function registerCalendarBrowserApiPaths() {
  return registerDefaultAppBaseResolver(calendarApiResolver);
}
