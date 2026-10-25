import { createIsomorphicFn } from '@tanstack/react-start';
import { configureInternalApiPaths } from '@tuturuuu/internal-api/client';
import { configureMeetingUrls } from '@tuturuuu/meet-core/runtime';
import { appPath, appUrl } from '@tuturuuu/start-bridge/app-url';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context';

configureInternalApiPaths((path) =>
  /^\/api\/(?:meet-call|meet-ai|meet-live)(?=\/|$|[?#])/u.test(path)
    ? appPath(path)
    : path
);

const documentOrigin = createIsomorphicFn()
  .server(
    () => maybeBridgeRequest()?.request.url ?? 'https://meet.tuturuuu.com'
  )
  .client(() => window.location.origin);

export function currentMeetBaseUrl() {
  return appUrl('/', documentOrigin()).replace(/\/$/u, '');
}

configureMeetingUrls({
  path: appPath,
  absolute: (path, origin) => appUrl(path, origin ?? documentOrigin()),
});
