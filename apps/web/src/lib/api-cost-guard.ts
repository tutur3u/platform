import { createHash } from 'node:crypto';
import {
  isSecurityEgressEnforcementEnabled,
  reserveSecurityBudget,
  type SecurityBudgetDimension,
} from '@tuturuuu/storage-core/security-budget';
import {
  FREE_SECURITY_BUDGET_POLICY,
  getSecurityBudgetPolicy,
  scaledSecurityBudgetLimit,
} from '@tuturuuu/storage-core/security-budget-policy';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveApiCostIdentity } from './api-cost-identity';

function configuredLimit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid limit');
  return value;
}

function limitResponse(status: number) {
  return NextResponse.json(
    {
      message:
        status === 429
          ? 'API request limit exceeded'
          : 'API protection temporarily unavailable',
    },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': String(
          status === 429 ? 60 - (Math.floor(Date.now() / 1000) % 60) : 60
        ),
      },
    }
  );
}
async function reserve(dimensions: SecurityBudgetDimension[]) {
  const result = await reserveSecurityBudget(dimensions);
  if (result[0] === 1) return null;
  if (result[0] === 0) return limitResponse(429);
  throw new Error('Invalid limiter response');
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
      ? resolveWorkspaceId(decodeURIComponent(workspaceSegment).toLowerCase())
      : undefined;
    if (workspace?.includes('/') || workspace?.includes('%')) throw new Error();
  } catch {
    return NextResponse.json(
      { message: 'Invalid workspace path' },
      { status: 400 }
    );
  }
  try {
    const identity = await resolveApiCostIdentity(request);
    const userId = identity.userId;
    workspace ??= identity.workspaceId;
    const accountPolicy = userId
      ? await getSecurityBudgetPolicy({ userId })
      : identity.workspaceId
        ? await getSecurityBudgetPolicy({ workspaceId: identity.workspaceId })
        : FREE_SECURITY_BUDGET_POLICY;
    const limits = [configuredLimit('API_GLOBAL_REQUESTS_PER_MINUTE', 10000)];
    if (accountPolicy.tier === 'FREE') {
      keys.push(`api-cost:v1:free-family:${family}:${minute}`);
      limits.push(configuredLimit('API_FREE_REQUESTS_PER_MINUTE', 2000));
    }
    const subject = createHash('sha256')
      .update(
        userId
          ? `user:${userId}`
          : identity.keyId
            ? `key:${identity.keyId}`
            : `ip:${extractIPFromHeaders(request.headers)}`
      )
      .digest('hex');
    keys.push(`api-cost:v1:subject:${family}:${subject}:${minute}`);
    limits.push(
      scaledSecurityBudgetLimit(
        configuredLimit('API_ACCOUNT_REQUESTS_PER_MINUTE', 120),
        accountPolicy
      )
    );
    const dimensions: SecurityBudgetDimension[] = keys.map((key, index) => [
      key,
      1,
      limits[index]!,
      120,
    ]);
    // Reject exhausted free/client pools before looking up an arbitrary target
    // workspace. Atomic checks keep denied free traffic from spending paid headroom.
    const response = await reserve(dimensions);
    if (response || !workspace) return response;
    const workspacePolicy =
      workspace === 'personal' && userId
        ? accountPolicy
        : await getSecurityBudgetPolicy({ workspaceId: workspace });
    const hash = createHash('sha256')
      .update(
        workspace === 'personal' && userId ? `personal:${userId}` : workspace
      )
      .digest('hex');
    return await reserve([
      [
        `api-cost:v1:workspace:${family}:${hash}:${minute}`,
        1,
        scaledSecurityBudgetLimit(
          configuredLimit(
            cms
              ? 'CMS_WORKSPACE_REQUESTS_PER_MINUTE'
              : 'API_WORKSPACE_REQUESTS_PER_MINUTE',
            cms ? 60 : 200
          ),
          workspacePolicy
        ),
        120,
      ],
    ]);
  } catch {
    return limitResponse(503);
  }
}
