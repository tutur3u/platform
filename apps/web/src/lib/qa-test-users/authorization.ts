import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import {
  QA_CI_OPERATOR_HEADER,
  QA_CI_OPERATOR_KIND,
  type QaCiClaims,
  verifyQaCiToken,
} from './github-oidc';
import { isQaTestAccount } from './policy';

export const QA_OPERATOR_PERMISSION = 'manage_qa_test_users' as PermissionId;
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };

/** A signed-in staff operator, or the GitHub Actions E2E workflow acting as one. */
export type QaOperatorPrincipal =
  | { kind: 'staff' }
  | { kind: 'github-ci'; claims: QaCiClaims };

function deny(status: 401 | 403 | 503, message: string) {
  return {
    ok: false as const,
    response: Response.json({ error: message }, { status, headers: noStore }),
  };
}

/**
 * The operator account must hold `manage_qa_test_users` in the root workspace
 * (root admins hold it implicitly) and be a verified staff identity that is
 * not a QA test account and not banned.
 */
async function admitOperator(
  operatorId: string,
  sessionUser: { id: string; email?: string | null } | null,
  request: Request
) {
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const { data, error } = await admin.auth.admin
    .getUserById(operatorId)
    .catch(() => ({ data: { user: null }, error: new Error('unavailable') }));
  if (error) return deny(503, 'Unable to verify operator access');
  const operator = data.user;
  if (
    !operator ||
    operator.id !== operatorId ||
    !isVerifiedTuturuuuStaffSession(operator) ||
    isQaTestAccount(operator) ||
    (operator.banned_until && Date.parse(operator.banned_until) > Date.now())
  ) {
    return deny(403, 'Forbidden');
  }
  let permissions: Awaited<ReturnType<typeof getPermissions>>;
  try {
    permissions = await getPermissions({
      wsId: ROOT_WORKSPACE_ID,
      user: sessionUser ?? { id: operator.id, email: operator.email ?? null },
      // The CI principal has no session; its permissions are the operator's own.
      ...(sessionUser ? { request } : {}),
    });
  } catch {
    return deny(503, 'Unable to verify operator access');
  }
  if (!permissions?.containsPermission(QA_OPERATOR_PERMISSION))
    return deny(403, 'Forbidden');
  return { ok: true as const, admin, operator };
}

const bearer = (request: Request) =>
  /^Bearer\s+(\S+)$/iu.exec(
    request.headers.get('authorization')?.trim() ?? ''
  )?.[1] ?? '';

/**
 * GitHub Actions OIDC: the Upskii production E2E workflow acts as the staff
 * account named by `QA_CI_OPERATOR_USER_ID`. Unsetting that variable is the
 * kill switch. The token is never logged.
 */
async function requireCiOperator(request: Request) {
  if (request.headers.get(QA_CI_OPERATOR_HEADER) !== QA_CI_OPERATOR_KIND) {
    console.warn('[qa-ci-operator] refused', { reason: 'operator_header' });
    return deny(401, 'Unauthorized');
  }
  const verified = await verifyQaCiToken(bearer(request));
  if (!verified.ok) {
    console.warn('[qa-ci-operator] refused', { reason: verified.reason });
    return deny(
      verified.status,
      verified.status === 401 ? 'Unauthorized' : 'Forbidden'
    );
  }
  const operatorId = z
    .uuid()
    .safeParse(process.env.QA_CI_OPERATOR_USER_ID?.trim());
  if (!operatorId.success) {
    console.warn('[qa-ci-operator] refused', {
      reason: 'operator_unconfigured',
      ...verified.claims,
    });
    return deny(503, 'QA CI operator is not configured');
  }
  const access = await admitOperator(operatorId.data, null, request);
  if (!access.ok) {
    console.warn('[qa-ci-operator] refused', {
      reason: 'operator_account',
      status: access.response.status,
      ...verified.claims,
    });
    return access;
  }
  return {
    ...access,
    principal: {
      kind: 'github-ci',
      claims: verified.claims,
    } as QaOperatorPrincipal,
  };
}

/**
 * QA operators: verified staff sessions (cookie or CLI bearer) holding
 * `manage_qa_test_users`, or the pinned GitHub Actions workflow when the
 * request carries `X-Tuturuuu-QA-Operator: github-oidc`. A QA test account can
 * never operate, even when it carries a staff address.
 */
export async function requireQaOperator(request: Request) {
  if (request.headers.has(QA_CI_OPERATOR_HEADER))
    return requireCiOperator(request);

  const { resolveSessionAuthContext } = await import('@/lib/api-auth');
  const session = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: [
      { targetApp: CLI_APP_TARGET_APP, requiredScope: CLI_APP_ACCESS_SCOPE },
    ],
  });
  if (!session.ok) {
    session.response.headers.set('Cache-Control', noStore['Cache-Control']);
    return { ok: false as const, response: session.response };
  }
  const access = await admitOperator(session.user.id, session.user, request);
  if (!access.ok) return access;
  return { ...access, principal: { kind: 'staff' } as QaOperatorPrincipal };
}
