import { appPath } from '@tuturuuu/start-bridge/app-url';
import { matchRoute } from '@tuturuuu/start-bridge/route-match';
import { beforeLocalApiOwner } from './api-owner-routing';
import { appApiPatterns } from './api-patterns.bridge.gen';

export function isCalendarApiPath(path: string) {
  const pathname = path.split(/[?#]/u, 1)[0] ?? '';
  const owner = beforeLocalApiOwner(pathname);
  if (owner) return owner === 'tasks';
  return appApiPatterns.some((pattern) => {
    try {
      return matchRoute(pattern, pathname) !== null;
    } catch (error) {
      if (error instanceof URIError) return false;
      throw error;
    }
  });
}
export function calendarApiPath(path: string) {
  return isCalendarApiPath(path) ? appPath(path) : path;
}
