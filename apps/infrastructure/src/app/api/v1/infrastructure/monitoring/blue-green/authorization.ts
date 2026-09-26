import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { setLogDrainUserContext } from '@/lib/infrastructure/log-drain';

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
  const actor = await resolveSatelliteRequestActor(request, 'infra');

  if (!actor) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  setLogDrainUserContext({
    userEmail: actor.user.email,
    userId: actor.user.id,
  });

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    user: actor.user,
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
    user: actor.user,
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
