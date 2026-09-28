'use server';

import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  enforceRootWorkspaceAdmin,
  getPermissions,
} from '@tuturuuu/utils/workspace-helper';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  type DevboxRunnerFeature,
  revokeDevboxRunner,
  setDevboxRunnerFeature,
  setDevboxRunnerHeartbeatEnabled,
  setDevboxRunnerResourceLimits,
} from '@/lib/devboxes/admin-store';
import {
  createDevboxRun,
  releaseDevboxLease,
  stopDevboxRun,
} from '@/lib/devboxes/store';

async function requireDevboxInfrastructureAdmin(wsId: string) {
  const user = await getSatelliteAppSessionUser('infra');
  if (!user) redirect(`/${wsId}/settings`);
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
  return user;
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

export async function setDevboxRunnerFeatureAction(
  wsId: string,
  runnerId: string,
  feature: DevboxRunnerFeature,
  enabled: boolean
) {
  await requireDevboxInfrastructureAdmin(wsId);
  await setDevboxRunnerFeature(runnerId, feature, enabled);
  revalidateDevboxPage(wsId);
}

const ResourceLimitsSchema = z.object({
  max_cpu_percent: z.coerce.number().int().min(10).max(80),
  max_memory_percent: z.coerce.number().int().min(10).max(80),
  max_sandboxes: z.coerce.number().int().min(1).max(16),
  max_instances: z.coerce.number().int().min(1).max(8),
  sandbox_memory_mb: z.coerce.number().int().min(128).max(4096),
  sandbox_timeout_seconds: z.coerce.number().int().min(1).max(120),
  sandbox_pids: z.coerce.number().int().min(16).max(256),
});

export async function setDevboxRunnerResourceLimitsAction(
  wsId: string,
  runnerId: string,
  formData: FormData
) {
  await requireDevboxInfrastructureAdmin(wsId);
  const limits = ResourceLimitsSchema.parse(
    Object.fromEntries(
      Object.keys(ResourceLimitsSchema.shape).map((key) => [
        key,
        formData.get(key),
      ])
    )
  );
  await setDevboxRunnerResourceLimits(runnerId, limits);
  revalidateDevboxPage(wsId);
}

export async function updateDevboxRunnerAction(wsId: string, runnerId: string) {
  const user = await requireDevboxInfrastructureAdmin(wsId);
  await createDevboxRun({
    actorId: user.id,
    command: ['bun', 'i', '-g', 'tuturuuu'],
    runnerId,
    timeoutSeconds: 300,
    workload: 'maintenance',
  });
  revalidateDevboxPage(wsId);
}

export async function restartDevboxRunnerAction(
  wsId: string,
  runnerId: string
) {
  const user = await requireDevboxInfrastructureAdmin(wsId);
  await createDevboxRun({
    actorId: user.id,
    command: ['__ttr_restart_agent_v1__'],
    runnerId,
    timeoutSeconds: 60,
    workload: 'maintenance',
  });
  revalidateDevboxPage(wsId);
}

export async function stopDevboxRunAction(wsId: string, runId: string) {
  await requireDevboxInfrastructureAdmin(wsId);
  await stopDevboxRun(runId);
  revalidateDevboxPage(wsId);
}
