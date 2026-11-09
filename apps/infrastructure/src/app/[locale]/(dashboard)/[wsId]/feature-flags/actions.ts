'use server';

import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import {
  asPrivateRpcAdmin,
  readPlatformFeatureFlagAudit,
} from '@/lib/feature-flags/platform-feature-flag-store';

const OPERATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeatureFlagReconcileResult =
  | { overrideEnabled: boolean | null; revision: number; status: 'found' }
  | { status: 'absent' | 'forbidden' | 'unauthenticated' | 'unavailable' };

export async function reconcileFeatureFlag(
  operationId: string
): Promise<FeatureFlagReconcileResult> {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'view_infrastructure'
  );
  if (!access.ok) {
    return {
      status: access.response.status === 401 ? 'unauthenticated' : 'forbidden',
    };
  }
  if (!OPERATION_ID.test(operationId)) return { status: 'unavailable' };
  const audit = await readPlatformFeatureFlagAudit({
    actorId: access.user.id,
    admin: asPrivateRpcAdmin(access.sbAdmin),
    limit: 1,
    operationId,
  });
  if (audit.status !== 'ready') {
    return { status: audit.status === 'denied' ? 'forbidden' : 'unavailable' };
  }
  const row = audit.rows[0];
  if (!row) return { status: 'absent' };
  return {
    overrideEnabled: row.newOverride,
    revision: row.newRevision,
    status: 'found',
  };
}
