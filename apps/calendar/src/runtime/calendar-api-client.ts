import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { calendarApiPath } from './calendar-api-path';
export function registerCalendarBrowserApiPaths() {
  return registerDefaultAppBaseResolver(calendarApiPath);
}
