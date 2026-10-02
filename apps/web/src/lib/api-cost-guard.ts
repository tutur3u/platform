import { createHash } from 'node:crypto';
import {
  isSecurityEgressEnforcementEnabled,
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
  if (!isSecurityEgressEnforcementEnabled() || request.method === 'OPTIONS')
    return null;
  const minute = Math.floor(Date.now() / 60_000);
  const path = request.nextUrl.pathname;
  const workspaceSegment = path.match(/^\/api\/v1\/workspaces\/([^/]+)/u)?.[1];
  // Fixed families prevent a delivery flood from spending auth/chat capacity,
  // without allowing arbitrary path strings to allocate new family counters.
  const cms = /\/(?:external-projects|external-apps)(?:\/|$)/u.test(path);
  const family =
    cms || /^\/api\/v1\/storage(?:\/|$)/u.test(path)
      ? 'delivery'
      : /\/(?:auth|sessions|oauth|app-token)(?:\/|$)/u.test(path)
        ? 'auth'
        : /\/(?:chat|ai|messages)(?:\/|$)/u.test(path)
          ? 'chat'
          : 'other';
  const keys = [`api-cost:v1:family:${family}:${minute}`];
  let workspace: string | undefined;
  try {
    workspace = workspaceSegment
      ? decodeURIComponent(workspaceSegment).toLowerCase()
      : undefined;
    if (workspace?.includes('/') || workspace?.includes('%')) throw new Error();
  } catch {
    return NextResponse.json(
      { message: 'Invalid workspace path' },
      { status: 400 }
    );
  }
  try {
    const limits = [configuredLimit('API_GLOBAL_REQUESTS_PER_MINUTE', 10000)];
    if (workspace) {
      const hash = createHash('sha256').update(workspace).digest('hex');
      keys.push(`api-cost:v1:workspace:${family}:${hash}:${minute}`);
      limits.push(
        cms
          ? configuredLimit('CMS_WORKSPACE_REQUESTS_PER_MINUTE', 600)
          : configuredLimit('API_WORKSPACE_REQUESTS_PER_MINUTE', 2000)
      );
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
    return NextResponse.json(
      { message: 'API protection temporarily unavailable' },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' },
      }
    );
  }
}
