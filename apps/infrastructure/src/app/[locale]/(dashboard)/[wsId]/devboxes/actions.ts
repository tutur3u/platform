'use server';

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  enforceRootWorkspaceAdmin,
  getPermissions,
} from '@tuturuuu/utils/workspace-helper';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  revokeDevboxRunner,
  setDevboxRunnerHeartbeatEnabled,
} from '@/lib/devboxes/admin-store';
import { releaseDevboxLease, stopDevboxRun } from '@/lib/devboxes/store';

async function requireDevboxInfrastructureAdmin(wsId: string) {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (
    !permissions ||
    (permissions.withoutPermission('manage_workspace_secrets') &&
      permissions.withoutPermission('manage_workspace_roles'))
  ) {
    redirect(`/${wsId}/settings`);
  }
}

function revalidateDevboxPage(wsId: string) {
  revalidatePath(`/${wsId}/devboxes`);
}

export async function releaseDevboxLeaseAction(wsId: string, leaseId: string) {
  await requireDevboxInfrastructureAdmin(wsId);
  await releaseDevboxLease(leaseId);
  revalidateDevboxPage(wsId);
}

export async function revokeDevboxRunnerAction(wsId: string, runnerId: string) {
  await requireDevboxInfrastructureAdmin(wsId);
  await revokeDevboxRunner(runnerId);
  revalidateDevboxPage(wsId);
}

export async function setDevboxRunnerHeartbeatEnabledAction(
  wsId: string,
  runnerId: string,
  enabled: boolean
) {
  await requireDevboxInfrastructureAdmin(wsId);
  await setDevboxRunnerHeartbeatEnabled(runnerId, enabled);
  revalidateDevboxPage(wsId);
}

export async function stopDevboxRunAction(wsId: string, runId: string) {
  await requireDevboxInfrastructureAdmin(wsId);
  await stopDevboxRun(runId);
  revalidateDevboxPage(wsId);
}
