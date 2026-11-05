import '@tanstack/react-start/server-only';
import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { appUrl } from '@tuturuuu/start-bridge/app-url';
import { bridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { isMailApiPath } from './mail-api-options';

export function registerMailServerApiPaths() {
  return registerDefaultAppBaseResolver((path) =>
    isMailApiPath(path) ? appUrl(path, bridgeRequest().request.url) : path
  );
}
