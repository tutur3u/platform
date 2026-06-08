import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

type InfrastructureMonitoringPermission =
  | 'manage_infrastructure_stress_tests'
  | 'manage_workspace_roles'
  | 'view_infrastructure';

const INFRASTRUCTURE_OPERATOR_PERMISSION = 'manage_workspace_roles';
const INFRASTRUCTURE_STRESS_TEST_MANAGER_PERMISSION =
  'manage_infrastructure_stress_tests';

export async function authorizeInfrastructureViewer(
  request: Request,
  requiredPermission: InfrastructureMonitoringPermission = 'view_infrastructure'
) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });

  if (
    !permissions ||
    permissions.withoutPermission(requiredPermission as never)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export function authorizeInfrastructureOperator(request: Request) {
  return authorizeInfrastructureViewer(
    request,
    INFRASTRUCTURE_OPERATOR_PERMISSION
  );
}

export function authorizeInfrastructureStressTestManager(request: Request) {
  return authorizeInfrastructureViewer(
    request,
    INFRASTRUCTURE_STRESS_TEST_MANAGER_PERMISSION
  );
}
