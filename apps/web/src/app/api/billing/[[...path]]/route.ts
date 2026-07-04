import type { NextRequest } from 'next/server';

import { dispatchLegacyApiRoute } from '@/legacy-api-routes/dispatcher';

export const GET = (request: NextRequest) =>
  dispatchLegacyApiRoute(request, 'GET');
export const HEAD = (request: NextRequest) =>
  dispatchLegacyApiRoute(request, 'HEAD');
export const POST = (request: NextRequest) =>
  dispatchLegacyApiRoute(request, 'POST');
export const PUT = (request: NextRequest) =>
  dispatchLegacyApiRoute(request, 'PUT');
export const PATCH = (request: NextRequest) =>
  dispatchLegacyApiRoute(request, 'PATCH');
export const DELETE = (request: NextRequest) =>
  dispatchLegacyApiRoute(request, 'DELETE');
export const OPTIONS = (request: NextRequest) =>
  dispatchLegacyApiRoute(request, 'OPTIONS');
