import '@tanstack/react-start/server-only';
import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { appUrl } from '@tuturuuu/start-bridge/app-url';
import { bridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { isCalendarApiPath } from './calendar-api-path';
export function registerCalendarServerApiPaths() {
  return registerDefaultAppBaseResolver((path) =>
    isCalendarApiPath(path) ? appUrl(path, bridgeRequest().request.url) : path
  );
}
