import type { NextRequest } from 'next/server';

import { createLegacyApiDispatcher } from '@/legacy-api-routes/dispatch-core';
import { cronRouteLoaders } from '@/legacy-api-routes/registry/cron';

const dispatch = createLegacyApiDispatcher(cronRouteLoaders, {
  requestPrefixSegments: ['cron'],
  routeFilePrefixSegments: ['cron'],
});

export const GET = (request: NextRequest) => dispatch(request, 'GET');
export const HEAD = (request: NextRequest) => dispatch(request, 'HEAD');
export const POST = (request: NextRequest) => dispatch(request, 'POST');
export const PUT = (request: NextRequest) => dispatch(request, 'PUT');
export const PATCH = (request: NextRequest) => dispatch(request, 'PATCH');
export const DELETE = (request: NextRequest) => dispatch(request, 'DELETE');
export const OPTIONS = (request: NextRequest) => dispatch(request, 'OPTIONS');
