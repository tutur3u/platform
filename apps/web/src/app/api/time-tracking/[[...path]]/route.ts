import type { NextRequest } from 'next/server';

import { createLegacyApiDispatcher } from '@/legacy-api-routes/dispatch-core';
import { time_trackingRouteLoaders } from '@/legacy-api-routes/registry/time_tracking';

const dispatch = createLegacyApiDispatcher(time_trackingRouteLoaders, {
  requestPrefixSegments: ['time-tracking'],
  routeFilePrefixSegments: ['time-tracking'],
});

export const GET = (request: NextRequest) => dispatch(request, 'GET');
export const HEAD = (request: NextRequest) => dispatch(request, 'HEAD');
export const POST = (request: NextRequest) => dispatch(request, 'POST');
export const PUT = (request: NextRequest) => dispatch(request, 'PUT');
export const PATCH = (request: NextRequest) => dispatch(request, 'PATCH');
export const DELETE = (request: NextRequest) => dispatch(request, 'DELETE');
export const OPTIONS = (request: NextRequest) => dispatch(request, 'OPTIONS');
