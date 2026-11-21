import { parseMutationPayload } from '@tuturuuu/feature-flags';
import type { MutationOutcome } from '@tuturuuu/feature-flags';
import { getInternalApiClient } from '@tuturuuu/internal-api/client';

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
  const unknown: FeatureFlagToggleResult = {
    operationId: input.operationId,
    status: 'unknown',
  };
  try {
    const response = await getInternalApiClient().fetch(
      '/api/v1/infrastructure/feature-flags',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-tuturuuu-feature-flag-action': '1',
        },
        body: JSON.stringify(input),
      }
    );
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'forbidden' };
    const body: unknown = await response.json();
    const outcome = parseMutationPayload(body);
    if (!outcome) return unknown;
    if (
      'flagKey' in outcome &&
      (outcome.flagKey !== input.flagKey ||
        outcome.environment !== input.environment)
    )
      return unknown;
    if (
      (outcome.status === 'applied' || outcome.status === 'replayed') &&
      (!response.ok || outcome.operationId !== input.operationId)
    )
      return unknown;
    return fromOutcome(outcome);
  } catch {
    // A transport failure cannot establish whether the original operation committed.
    return unknown;
  }
}
