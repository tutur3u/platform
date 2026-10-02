import { createHash } from 'node:crypto';
import {
  reserveSecurityBudget,
  type SecurityBudgetDimension,
} from '@tuturuuu/storage-core/security-budget';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function configuredLimit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid limit');
  return value;
}

/** Shared ceilings supplement caller limits, including trusted/CMS bypasses. */
export async function guardApiCost(request: NextRequest) {
  if (request.method === 'OPTIONS') return null;
  const minute = Math.floor(Date.now() / 60_000);
  const keys = [`api-cost:v1:global:${minute}`];
  const workspace = request.nextUrl.pathname.match(
    /^\/api\/v1\/workspaces\/([^/]+)\/(?:external-projects|external-apps)(?:\/|$)/u
  )?.[1];
  try {
    const limits = [configuredLimit('API_GLOBAL_REQUESTS_PER_MINUTE', 10000)];
    if (workspace) {
      // Ignore query strings, asset IDs, credentials and caller IPs. All existing
      // CMS endpoints for this workspace consume the same read/write ceiling.
      const hash = createHash('sha256')
        .update(workspace.toLowerCase())
        .digest('hex');
      keys.push(`api-cost:v1:cms:${hash}:${minute}`);
      limits.push(configuredLimit('CMS_WORKSPACE_REQUESTS_PER_MINUTE', 600));
    }
    const dimensions: SecurityBudgetDimension[] = keys.map((key, index) => [
      key,
      1,
      limits[index]!,
      120,
    ]);
    const result = await reserveSecurityBudget(dimensions);
    if (Array.isArray(result) && result.length === 2 && result[0] === 1)
      return null;
    if (!Array.isArray(result) || result.length !== 2 || result[0] !== 0)
      throw new Error('Invalid limiter response');
    return NextResponse.json(
      { message: 'API request limit exceeded' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'private, no-store',
          'Retry-After': String(60 - (Math.floor(Date.now() / 1000) % 60)),
        },
      }
    );
  } catch {
    console.error('Shared API cost protection unavailable');
    return NextResponse.json(
      { message: 'API protection temporarily unavailable' },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' },
      }
    );
  }
}
