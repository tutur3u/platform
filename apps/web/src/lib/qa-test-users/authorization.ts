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
import { isQaTestAccount } from './policy';

export const QA_OPERATOR_PERMISSION = 'manage_qa_test_users' as PermissionId;
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };

function deny(status: 401 | 403 | 503, message: string) {
  return {
    ok: false as const,
    response: Response.json({ error: message }, { status, headers: noStore }),
  };
}

/**
 * QA operators: verified staff sessions holding `manage_qa_test_users` in the
 * root workspace (root admins hold it implicitly). A QA test account can never
 * operate, even when it carries a staff address.
 */
export async function requireQaOperator(request: Request) {
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

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    user: session.user,
    request,
  });
  if (!permissions?.containsPermission(QA_OPERATOR_PERMISSION))
    return deny(403, 'Forbidden');

  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const { data, error } = await admin.auth.admin
    .getUserById(session.user.id)
    .catch(() => ({ data: { user: null }, error: new Error('unavailable') }));
  if (error) return deny(503, 'Unable to verify operator access');
  const operator = data.user;
  if (
    !operator ||
    operator.id !== session.user.id ||
    !isVerifiedTuturuuuStaffSession(operator) ||
    isQaTestAccount(operator) ||
    (operator.banned_until && Date.parse(operator.banned_until) > Date.now())
  ) {
    return deny(403, 'Forbidden');
  }
  return { ok: true as const, admin, operator };
}
