import { createIsomorphicFn } from '@tanstack/react-start';
import { configureMeetApiPaths } from '@tuturuuu/internal-api/meet-call';
import { configureMeetingUrls } from '@tuturuuu/meet-core/runtime';
import { appPath, appUrl } from '@tuturuuu/start-bridge/app-url';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context';

const documentOrigin = createIsomorphicFn()
  .server(
    () =>
      maybeBridgeRequest()?.request.url ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'https://meet.tuturuuu.com'
  )
  .client(() => window.location.origin);

configureMeetApiPaths(
  createIsomorphicFn()
    .server((path: string) => appUrl(path, documentOrigin()))
    .client(appPath)
);

export function currentMeetBaseUrl() {
  return appUrl('/', documentOrigin()).replace(/\/$/u, '');
}

configureMeetingUrls({
  path: appPath,
  absolute: (path, origin) => appUrl(path, origin ?? documentOrigin()),
});
