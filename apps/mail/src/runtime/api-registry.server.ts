import '@tanstack/react-start/server-only';
import type { NextRequest } from 'next/server';
import { dispatchEndpoint } from './api-dispatch';
import { mailRoutes0 } from './api-routes-0.server';
import { mailRoutes1 } from './api-routes-1.server';
import { mailRoutes2 } from './api-routes-2.server';
export const mailEndpoints = [...mailRoutes0, ...mailRoutes1, ...mailRoutes2];
export function dispatchMailEndpoint(request: NextRequest) {
  return dispatchEndpoint(request, mailEndpoints);
}
