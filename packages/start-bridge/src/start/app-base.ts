import { appPath, appUrl } from '../core/app-url';
import { maybeBridgeRequest } from '../core/request-context';
import { fromNextSourcePattern, matchRoute } from '../core/route-match';

/**
 * The default app-base resolver for `@tuturuuu/internal-api` (#6764's
 * `registerDefaultAppBaseResolver`). App-owned API paths (the generated
 * client-safe `appApiPatterns`, minus `centralFirst`) gain the app's mount:
 * in the browser as a mounted relative path, on the server as an absolute
 * URL on the incoming request's host. Every other path is returned
 * unchanged, so Web-owned routes keep internal-api's own resolution. The
 * request is read on every call, never captured.
 */
export function createAppBaseResolver(
  appApiPatterns: readonly string[],
  centralFirst: readonly string[] = []
) {
  const central = centralFirst.map(fromNextSourcePattern);
  const matchesAny = (patterns: readonly string[], pathname: string) =>
    patterns.some((pattern) => {
      try {
        return matchRoute(pattern, pathname) !== null;
      } catch {
        return false;
      }
    });
  // Ownership is explicit: at a root mount an owned path resolves to itself.
  const owns = (pathname: string) =>
    !matchesAny(central, pathname) && matchesAny(appApiPatterns, pathname);
  const resolve = (path: string): string => {
    const end = path.search(/[?#]/u);
    const pathname = end === -1 ? path : path.slice(0, end);
    if (!owns(pathname)) return path;
    const context = maybeBridgeRequest();
    return context ? appUrl(path, context.request.url) : appPath(path);
  };
  return Object.assign(resolve, { owns });
}
