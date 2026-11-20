import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import type { AuthorizedRequest, withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export const headers = { 'Cache-Control': 'private, no-store' };
export const bodyLimit = 131072;
export const options = {
  allowAppSessionAuth: { targetApp: ['finance'] },
  maxPayloadSize: bodyLimit,
  rateLimit: { windowMs: 60_000, maxRequests: 20 },
} satisfies NonNullable<Parameters<typeof withSessionAuth>[1]>;

export function responseError(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers });
}

export async function authorize(
  request: NextRequest,
  context: AuthorizedRequest,
  rawWorkspaceId: string,
  action: 'view_transactions' | 'create_transactions'
) {
  if (process.env.ENABLE_FINANCE_BILL_SPLITS !== 'true') {
    return { response: responseError('Not found', 404) };
  }

  const wsId = await normalizeWorkspaceId(
    rawWorkspaceId,
    context.supabase,
    request
  );
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: context.user.id,
    supabase: context.supabase,
    requiredType: 'MEMBER',
  });
  if (!membership.ok) {
    return {
      response:
        membership.error === 'membership_lookup_failed'
          ? responseError('Workspace access could not be verified', 500)
          : responseError('Not found', 404),
    };
  }

  const permissions = await getPermissions({
    wsId,
    user: context.user,
    request,
  });
  if (!permissions?.containsPermission(action)) {
    return { response: responseError('Insufficient permissions', 403) };
  }
  return { wsId, actorId: context.user.id, permissions };
}

export function storeError(code: string) {
  if (code === 'PT409')
    return responseError(
      'Split creation conflicts with an existing operation',
      409
    );
  if (code === '42501') return responseError('Not found', 404);
  if (['22023', '23503', '23505', '23514'].includes(code)) {
    return responseError('Invalid split or workspace participants', 400);
  }
  if (code === 'PGRST202' || code === '42883') {
    return responseError('Bill splits are temporarily unavailable', 503);
  }
  console.error('Bill split store failed', { code });
  return responseError('Bill split request failed', 500);
}
