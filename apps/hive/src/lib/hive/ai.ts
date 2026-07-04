import { resolvePlanModel } from '@tuturuuu/ai/credits/resolve-plan-model';
import type { AiCreditStatus } from '@tuturuuu/ai/credits/types';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { writeAiCreditSnapshot } from '@tuturuuu/utils/ai-temp-auth';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getWorkspaceTier,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';

type ProductTier = 'ENTERPRISE' | 'FREE' | 'PLUS' | 'PRO';

type AllocationDefaults = {
  allowed_features: string[];
  allowed_models: string[];
  daily_limit: number | null;
  default_image_model?: string | null;
  default_language_model?: string | null;
  max_output_tokens_per_request: number | null;
};

export type HiveCreditSource = 'personal' | 'workspace';

type HiveAiCreditStatus = AiCreditStatus & {
  payg: {
    nextExpiry: string | null;
    remaining: number;
    totalGranted: number;
    totalUsed: number;
  };
};

export class HiveAiAccessError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'HiveAiAccessError';
  }
}

function getFallbackDefaultModels(tier: ProductTier) {
  return {
    defaultImageModel:
      tier === 'FREE'
        ? 'google/imagen-4.0-fast-generate-001'
        : 'google/imagen-4.0-generate-001',
    defaultLanguageModel: 'google/gemini-2.5-flash-lite',
  };
}

function normalizeTier(value: string | null | undefined): ProductTier {
  switch (value) {
    case 'ENTERPRISE':
    case 'FREE':
    case 'PLUS':
    case 'PRO':
      return value;
    default:
      return 'FREE';
  }
}

function firstRow<T>(value: T[] | T | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getHivePersonalWorkspaceId(input: {
  sbAdmin: TypedSupabaseClient;
  userId: string;
}) {
  const { data, error } = await input.sbAdmin
    .from('workspaces')
    .select('id, workspace_members!inner(user_id, type)')
    .eq('personal', true)
    .eq('workspace_members.user_id', input.userId)
    .eq('workspace_members.type', 'MEMBER')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to resolve Hive personal workspace', {
      error: error.message,
      userId: input.userId,
    });
    throw new HiveAiAccessError('Personal workspace lookup failed', 500);
  }

  if (!data?.id) {
    throw new HiveAiAccessError('Personal workspace not found', 404);
  }

  return data.id;
}

export async function resolveHiveWorkspaceId(input: {
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  const normalizedInput = input.wsId.trim();
  const normalizedWsId =
    normalizedInput.toLowerCase() === PERSONAL_WORKSPACE_SLUG
      ? await getHivePersonalWorkspaceId(input)
      : resolveWorkspaceId(normalizedInput);

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: input.sbAdmin,
    userId: input.userId,
    wsId: normalizedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    throw new HiveAiAccessError('Failed to verify workspace access', 500);
  }

  if (!membership.ok) {
    throw new HiveAiAccessError('Workspace access denied', 403);
  }

  return normalizedWsId;
}

async function isPersonalWorkspace(input: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await input.sbAdmin
    .from('workspaces')
    .select('personal')
    .eq('id', input.wsId)
    .maybeSingle();

  if (error) {
    throw new HiveAiAccessError('Failed to load workspace', 500);
  }

  return data?.personal === true;
}

export async function resolveHiveCreditContext(input: {
  creditSource?: HiveCreditSource | null;
  creditWsId?: string | null;
  sbAdmin: TypedSupabaseClient;
  userId: string;
}) {
  const requestedSource = input.creditSource ?? 'personal';

  if (requestedSource === 'personal') {
    const personalWorkspaceId = await getHivePersonalWorkspaceId(input);

    if (input.creditWsId && input.creditWsId !== personalWorkspaceId) {
      throw new HiveAiAccessError(
        'Personal credit source must use the personal workspace',
        400
      );
    }

    return {
      creditSource: 'personal' as const,
      creditWsId: personalWorkspaceId,
    };
  }

  if (!input.creditWsId) {
    throw new HiveAiAccessError('Workspace credit source requires wsId', 400);
  }

  const creditWsId = await resolveHiveWorkspaceId({
    sbAdmin: input.sbAdmin,
    userId: input.userId,
    wsId: input.creditWsId,
  });

  if (await isPersonalWorkspace({ sbAdmin: input.sbAdmin, wsId: creditWsId })) {
    return {
      creditSource: 'personal' as const,
      creditWsId,
    };
  }

  return {
    creditSource: 'workspace' as const,
    creditWsId,
  };
}

export async function resolveHiveAllowedModel(input: {
  requestedModel?: string | null;
  wsId: string;
}) {
  const resolvedModel = await resolvePlanModel({
    capability: 'language',
    requestedModel: input.requestedModel,
    wsId: input.wsId,
  });

  return resolvedModel.modelId;
}

export async function getHiveAiCreditStatus(input: {
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}): Promise<HiveAiCreditStatus> {
  const normalizedWsId = await resolveHiveWorkspaceId(input);
  const tier = normalizeTier(
    await getWorkspaceTier(normalizedWsId, { useAdmin: true })
  );
  const balanceScope: 'user' | 'workspace' =
    tier === 'FREE' ? 'user' : 'workspace';

  const { data: balanceRows, error: balanceError } = await input.sbAdmin.rpc(
    'get_or_create_credit_balance',
    { p_user_id: input.userId, p_ws_id: normalizedWsId }
  );

  if (balanceError) {
    console.error('Failed to get Hive AI credit balance', {
      error: balanceError.message,
      userId: input.userId,
      wsId: normalizedWsId,
    });
    throw new HiveAiAccessError('Failed to get credit balance', 500);
  }

  const balance = firstRow(
    balanceRows as
      | Array<{
          bonus_credits?: number | string | null;
          id: string;
          period_end: string;
          period_start: string;
          total_allocated?: number | string | null;
          total_used?: number | string | null;
        }>
      | {
          bonus_credits?: number | string | null;
          id: string;
          period_end: string;
          period_start: string;
          total_allocated?: number | string | null;
          total_used?: number | string | null;
        }
      | null
  );

  if (!balance) {
    throw new HiveAiAccessError('No credit balance found', 500);
  }

  const includedAllocated = Number(balance.total_allocated ?? 0);
  const includedUsed = Number(balance.total_used ?? 0);
  const bonusCredits = Number(balance.bonus_credits ?? 0);
  const includedRemaining = includedAllocated + bonusCredits - includedUsed;

  const { data: paygRows, error: paygError } = await input.sbAdmin
    .from('workspace_credit_pack_purchases')
    .select('tokens_granted, tokens_remaining, expires_at, status')
    .eq('ws_id', normalizedWsId)
    .in('status', ['active', 'canceled'])
    .gt('expires_at', new Date().toISOString());

  if (paygError) {
    console.error('Failed to load Hive AI pay-as-you-go credits', {
      error: paygError.message,
      wsId: normalizedWsId,
    });
    throw new HiveAiAccessError('Failed to get pay-as-you-go balances', 500);
  }

  const paygTotalGranted = (paygRows ?? []).reduce(
    (sum, row) => sum + Number(row.tokens_granted ?? 0),
    0
  );
  const paygRemaining = (paygRows ?? []).reduce(
    (sum, row) => sum + Number(row.tokens_remaining ?? 0),
    0
  );
  const paygUsed = paygTotalGranted - paygRemaining;
  const nextExpiry =
    (paygRows ?? [])
      .map((row) => row.expires_at)
      .filter((value): value is string => typeof value === 'string')
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

  const totalAllocated = includedAllocated + paygTotalGranted;
  const totalUsed = includedUsed + paygUsed;
  const remaining = includedRemaining + paygRemaining;
  const totalPool = totalAllocated + bonusCredits;
  const percentUsed = totalPool > 0 ? (totalUsed / totalPool) * 100 : 0;

  const { data: allocationData } = await input.sbAdmin
    .from('ai_credit_plan_allocations')
    .select('*')
    .eq('tier', tier)
    .eq('is_active', true)
    .maybeSingle();
  const allocation = allocationData as AllocationDefaults | null;
  const fallbackDefaults = getFallbackDefaultModels(tier);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: dailyTransactions } = await input.sbAdmin
    .from('ai_credit_transactions')
    .select('amount')
    .eq('balance_id', balance.id)
    .eq('transaction_type', 'deduction')
    .gte('created_at', todayStart.toISOString());
  const dailyUsed = (dailyTransactions ?? []).reduce(
    (sum, transaction) => sum + Math.abs(Number(transaction.amount)),
    0
  );

  let seatCount: number | null = null;
  if (balanceScope === 'workspace') {
    const { data: subData } = await input.sbAdmin
      .from('workspace_subscriptions')
      .select('seat_count')
      .eq('ws_id', normalizedWsId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    seatCount = subData?.seat_count ?? null;
  }

  await writeAiCreditSnapshot({
    snapshot: {
      allowedFeatures: allocation?.allowed_features ?? [],
      allowedModels: allocation?.allowed_models ?? [],
      dailyLimit: allocation?.daily_limit
        ? Number(allocation.daily_limit)
        : null,
      maxOutputTokens: allocation?.max_output_tokens_per_request ?? null,
      remainingCredits: remaining,
      tier,
      updatedAt: Date.now(),
    },
    userId: input.userId,
    wsId: normalizedWsId,
  });

  return {
    allowedFeatures: allocation?.allowed_features ?? [],
    allowedModels: allocation?.allowed_models ?? [],
    balanceScope,
    bonusCredits,
    dailyLimit: allocation?.daily_limit ? Number(allocation.daily_limit) : null,
    dailyUsed,
    defaultImageModel:
      allocation?.default_image_model ?? fallbackDefaults.defaultImageModel,
    defaultLanguageModel:
      allocation?.default_language_model ??
      fallbackDefaults.defaultLanguageModel,
    maxOutputTokens: allocation?.max_output_tokens_per_request ?? null,
    payg: {
      nextExpiry,
      remaining: paygRemaining,
      totalGranted: paygTotalGranted,
      totalUsed: paygUsed,
    },
    percentUsed,
    periodEnd: balance.period_end,
    periodStart: balance.period_start,
    remaining,
    seatCount,
    tier,
    totalAllocated,
    totalUsed,
  };
}
