import type { NextRequest, NextResponse } from 'next/server';
import { guardApiCost } from '@/lib/api-cost-guard';
import { guardWebApiCsrf } from './csrf';

/** `/api/*` preflight for proxy.ts: the CSRF check, then the cost guard. */
export async function guardApiCostAndCsrf(
  req: NextRequest,
  configuredOrigin: string
): Promise<NextResponse | null> {
  return (
    guardWebApiCsrf(req, { configuredOrigin }) ?? (await guardApiCost(req))
  );
}
