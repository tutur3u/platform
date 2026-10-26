import '@tanstack/react-start/server-only';
import { dispatchEndpoint } from '@tuturuuu/start-bridge/endpoints';
import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { endpoints } from './api-registry.bridge.gen';

export { endpoints as calendarEndpoints } from './api-registry.bridge.gen';
export function dispatchCalendarEndpoint(request: NextRequest) {
  return dispatchEndpoint(endpoints, request, {
    pathname: request.nextUrl.pathname,
  });
}
