import { createIsomorphicFn } from '@tanstack/react-start';
import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
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

const isMeetApi = (path: string) =>
  /^\/api\/(?:meet-call|meet-ai|meet-live)(?=\/|$|[?#])/u.test(path);

registerDefaultAppBaseResolver(
  createIsomorphicFn()
    .server((path: string) =>
      isMeetApi(path) ? appUrl(path, documentOrigin()) : path
    )
    .client((path: string) => (isMeetApi(path) ? appPath(path) : path))
);

export function currentMeetBaseUrl() {
  return appUrl('/', documentOrigin()).replace(/\/$/u, '');
}

configureMeetingUrls({
  path: appPath,
  absolute: (path, origin) => appUrl(path, origin ?? documentOrigin()),
});
