'use server';

import { assessFeatureFlagMutation } from '@tuturuuu/feature-flags';
import type { MutationOutcome } from '@tuturuuu/feature-flags';
import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import {
  asPrivateRpcAdmin,
  commitPlatformFeatureFlag,
  readPlatformFeatureFlagAudit,
} from '@/lib/feature-flags/platform-feature-flag-store';

const OPERATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FeatureFlagToggleResult {
  code?: string;
  matchesRequest?: boolean;
  operationId?: string;
  overrideEnabled?: boolean | null;
  revision?: number | null;
  status:
    | 'applied'
    | 'conflict'
    | 'forbidden'
    | 'noop'
    | 'rejected'
    | 'replayed'
    | 'unauthenticated'
    | 'unknown';
}

export type FeatureFlagReconcileResult =
  | { overrideEnabled: boolean | null; revision: number; status: 'found' }
  | { status: 'absent' | 'forbidden' | 'unauthenticated' | 'unavailable' };

function fromOutcome(outcome: MutationOutcome): FeatureFlagToggleResult {
  if (outcome.status === 'applied' || outcome.status === 'replayed') {
    return {
      matchesRequest: outcome.matchesRequest,
      operationId: outcome.operationId,
      overrideEnabled: outcome.newOverride,
      revision: outcome.revision,
      status: outcome.status,
    };
  }
  if (outcome.status === 'noop') {
    return {
      overrideEnabled: outcome.overrideEnabled,
      revision: outcome.revision,
      status: 'noop',
    };
  }
  if (outcome.status === 'conflict') {
    return { revision: outcome.revision, status: 'conflict' };
  }
  if (outcome.code === 'denied') return { status: 'forbidden' };
  return { code: outcome.code, status: 'rejected' };
}

export async function mutateFeatureFlag(input: {
  environment: string;
  expectedRevision: number;
  flagKey: string;
  operationId: string;
  overrideEnabled: boolean | null;
}): Promise<FeatureFlagToggleResult> {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles'
  );
  if (!access.ok) {
    return {
      status: access.response.status === 401 ? 'unauthenticated' : 'forbidden',
    };
  }
  const decision = assessFeatureFlagMutation({
    authenticated: true,
    body: input,
    canMutate: true,
    rootMember: true,
    sessionActorId: access.user.id,
  });
  if (decision.kind !== 'command') {
    if (decision.kind === 'outcome') return fromOutcome(decision.outcome);
    return {
      status:
        decision.kind === 'unauthenticated' ? 'unauthenticated' : 'forbidden',
    };
  }
  const result = await commitPlatformFeatureFlag({
    admin: asPrivateRpcAdmin(access.sbAdmin),
    command: decision.command,
  });
  if (result.status === 'unknown') {
    return { operationId: result.operationId, status: 'unknown' };
  }
  return fromOutcome(result.outcome);
}

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
