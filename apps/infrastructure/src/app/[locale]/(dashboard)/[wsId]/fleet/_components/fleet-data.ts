import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  type DevboxControlSnapshot,
  listDevboxControlSnapshot,
} from '@/lib/devboxes/admin-store';
import { enforceInfrastructureRootWorkspace } from '../../enforce-infrastructure-root';

export type FleetTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export type FleetSnapshotResult =
  | { ok: true; snapshot: DevboxControlSnapshot }
  | { ok: false };

async function loadSnapshot(): Promise<FleetSnapshotResult> {
  try {
    return { ok: true, snapshot: await listDevboxControlSnapshot() };
  } catch (error) {
    console.error('Fleet snapshot failed', error);
    return { ok: false };
  }
}

/** Resolves the actor, root access, translations and one fleet snapshot. */
export async function loadFleetPage(wsId: string) {
  await enforceInfrastructureRootWorkspace(wsId);

  const user = await getSatelliteAppSessionUser('infra');
  if (!user?.id) redirect('/login');

  const permissions = await getPermissions({ user, wsId: ROOT_WORKSPACE_ID });
  if (!permissions || permissions.withoutPermission('view_infrastructure')) {
    notFound();
  }

  const [rawT, locale, result] = await Promise.all([
    getTranslations('fleet'),
    getLocale(),
    loadSnapshot(),
  ]);
  const t: FleetTranslator = (key, values) =>
    rawT(key as never, values as never);

  return {
    canManage:
      permissions.containsPermission('manage_workspace_secrets') ||
      permissions.containsPermission('manage_workspace_roles'),
    locale,
    now: new Date(),
    result,
    t,
  };
}
