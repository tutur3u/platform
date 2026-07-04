import type { NextRequest } from 'next/server';

import { dispatchLegacyV1ApiRoute } from '@/legacy-api-routes/dispatcher';

export const GET = (request: NextRequest) =>
  dispatchLegacyV1ApiRoute(request, 'GET');
export const HEAD = (request: NextRequest) =>
  dispatchLegacyV1ApiRoute(request, 'HEAD');
export const POST = (request: NextRequest) =>
  dispatchLegacyV1ApiRoute(request, 'POST');
export const PUT = (request: NextRequest) =>
  dispatchLegacyV1ApiRoute(request, 'PUT');
export const PATCH = (request: NextRequest) =>
  dispatchLegacyV1ApiRoute(request, 'PATCH');
export const DELETE = (request: NextRequest) =>
  dispatchLegacyV1ApiRoute(request, 'DELETE');
export const OPTIONS = (request: NextRequest) =>
  dispatchLegacyV1ApiRoute(request, 'OPTIONS');
