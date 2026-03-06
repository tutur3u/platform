import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspaceTier } from '@tuturuuu/utils/workspace-helper';
import { matchesAllowedModel, resolveGatewayModelId } from './model-mapping';

export type PlanModelCapability = 'image' | 'language';

type WorkspaceProductTier = 'ENTERPRISE' | 'FREE' | 'PLUS' | 'PRO';

type AllocationRow = {
  allowed_models: string[];
  default_image_model?: string | null;
  default_language_model?: string | null;
  id: string;
  tier: WorkspaceProductTier;
};

type GatewayModelRow = {
  id: string;
  is_enabled: boolean;
  type: PlanModelCapability;
};

export class PlanModelResolutionError extends Error {
  code:
    | 'DEFAULT_MODEL_DISABLED'
    | 'DEFAULT_MODEL_INVALID'
    | 'NO_ALLOCATION'
    | 'WORKSPACE_ID_REQUIRED';

  constructor(code: PlanModelResolutionError['code'], message: string) {
    super(message);
    this.name = 'PlanModelResolutionError';
    this.code = code;
  }
}

export interface EffectivePlanModel {
  allocationId: string;
  modelId: string;
  source: 'plan_default' | 'requested';
  tier: AllocationRow['tier'];
}

function getDefaultModelField(capability: PlanModelCapability) {
  return capability === 'language'
    ? 'default_language_model'
    : 'default_image_model';
}

function getFallbackPlanModelId(
  tier: WorkspaceProductTier,
  capability: PlanModelCapability
) {
  if (capability === 'language') {
    return 'google/gemini-2.5-flash-lite';
  }

  switch (tier) {
    case 'FREE':
      return 'google/imagen-4.0-fast-generate-001';
    case 'PLUS':
    case 'PRO':
    case 'ENTERPRISE':
      return 'google/imagen-4.0-generate-001';
  }
}

export function selectEffectivePlanModel(args: {
  allocation: AllocationRow;
  capability: PlanModelCapability;
  modelsById: Map<string, GatewayModelRow>;
  requestedModel?: string | null;
}): EffectivePlanModel {
  const { allocation, capability, modelsById } = args;
  const requestedModel = args.requestedModel?.trim()
    ? resolveGatewayModelId(args.requestedModel)
    : null;
  const defaultModelId =
    allocation[getDefaultModelField(capability)] ??
    getFallbackPlanModelId(allocation.tier, capability);

  if (requestedModel) {
    const requestedRow = modelsById.get(requestedModel);
    if (
      requestedRow?.is_enabled &&
      requestedRow.type === capability &&
      matchesAllowedModel(requestedModel, allocation.allowed_models)
    ) {
      return {
        allocationId: allocation.id,
        modelId: requestedModel,
        source: 'requested',
        tier: allocation.tier,
      };
    }
  }

  const defaultRow = modelsById.get(defaultModelId);
  if (!defaultRow) {
    throw new PlanModelResolutionError(
      'DEFAULT_MODEL_INVALID',
      `Default ${capability} model "${defaultModelId}" is missing from ai_gateway_models.`
    );
  }

  if (!defaultRow.is_enabled) {
    throw new PlanModelResolutionError(
      'DEFAULT_MODEL_DISABLED',
      `Default ${capability} model "${defaultModelId}" is currently disabled.`
    );
  }

  if (defaultRow.type !== capability) {
    throw new PlanModelResolutionError(
      'DEFAULT_MODEL_INVALID',
      `Default ${capability} model "${defaultModelId}" has incompatible type "${defaultRow.type}".`
    );
  }

  if (!matchesAllowedModel(defaultModelId, allocation.allowed_models)) {
    throw new PlanModelResolutionError(
      'DEFAULT_MODEL_INVALID',
      `Default ${capability} model "${defaultModelId}" is not included in the allocation allowlist.`
    );
  }

  return {
    allocationId: allocation.id,
    modelId: defaultModelId,
    source: 'plan_default',
    tier: allocation.tier,
  };
}

export async function resolvePlanModel(args: {
  capability: PlanModelCapability;
  requestedModel?: string | null;
  wsId?: string | null;
}): Promise<EffectivePlanModel> {
  if (!args.wsId) {
    throw new PlanModelResolutionError(
      'WORKSPACE_ID_REQUIRED',
      'Workspace ID is required to resolve a plan model.'
    );
  }

  const sbAdmin = await createAdminClient();
  const tier = await getWorkspaceTier(args.wsId, { useAdmin: true });

  const { data: allocationData, error: allocationError } = await sbAdmin
    .from('ai_credit_plan_allocations')
    .select('*')
    .eq('tier', tier)
    .eq('is_active', true)
    .maybeSingle();

  if (allocationError) {
    throw new PlanModelResolutionError(
      'NO_ALLOCATION',
      allocationError.message ||
        `Failed to load AI credit allocation for ${tier}.`
    );
  }

  const allocation = allocationData as AllocationRow | null;

  if (!allocation) {
    throw new PlanModelResolutionError(
      'NO_ALLOCATION',
      `No AI credit allocation configured for the ${tier} plan.`
    );
  }

  const candidateIds = new Set<string>([
    allocation.default_language_model ??
      getFallbackPlanModelId(allocation.tier, 'language'),
    allocation.default_image_model ??
      getFallbackPlanModelId(allocation.tier, 'image'),
  ]);

  if (args.requestedModel?.trim()) {
    candidateIds.add(resolveGatewayModelId(args.requestedModel));
  }

  const { data: models, error: modelsError } = await sbAdmin
    .from('ai_gateway_models')
    .select('id, type, is_enabled')
    .in('id', Array.from(candidateIds));

  if (modelsError) {
    throw new PlanModelResolutionError(
      'DEFAULT_MODEL_INVALID',
      modelsError.message || 'Failed to load AI gateway model details.'
    );
  }

  const modelsById = new Map(
    ((models ?? []) as GatewayModelRow[]).map(
      (model) => [model.id, model] as const
    )
  );

  return selectEffectivePlanModel({
    allocation,
    capability: args.capability,
    modelsById,
    requestedModel: args.requestedModel,
  });
}
