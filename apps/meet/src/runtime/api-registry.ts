import {
  dispatchEndpoint,
  sortEndpoints,
} from '@tuturuuu/start-bridge/endpoints';
import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import * as roomPreview from '../app/[locale]/r/[code]/preview/route';
import { endpoints } from './api-registry.bridge.gen';

export const meetEndpoints = sortEndpoints([
  ...endpoints,
  { pattern: '/[locale]/r/[code]/preview', module: roomPreview },
]);

export function dispatchMeetEndpoint(request: NextRequest) {
  return dispatchEndpoint(meetEndpoints, request, {
    pathname: request.nextUrl.pathname,
  });
}
