import '@tanstack/react-start/server-only';
import { dispatchEndpoint } from '@tuturuuu/start-bridge/endpoints';
import type { NextRequest } from 'next/server';
import { endpoints } from './api-registry.bridge.gen';

export { endpoints as mailEndpoints } from './api-registry.bridge.gen';

export function dispatchMailEndpoint(request: NextRequest) {
  return dispatchEndpoint(endpoints, request, {
    pathname: request.nextUrl.pathname,
  });
}
