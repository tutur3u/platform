import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { writeAiCreditSnapshot } from '@tuturuuu/utils/ai-temp-auth';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  isWorkspaceUuidLiteral,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';

type ProductTier = 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';

type AllocationDefaults = {
  allowed_features: string[];
  allowed_models: string[];
  daily_limit: number | null;
  default_image_model?: string | null;
  default_language_model?: string | null;
  max_output_tokens_per_request: number | null;
};

export class AiCreditsStatusError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'AiCreditsStatusError';
  }
}

function getFallbackDefaultModels(tier: ProductTier) {
  return {
    defaultImageModel:
      tier === 'FREE'
        ? 'google/imagen-4.0-fast-generate-001'
        : 'google/imagen-4.0-generate-001',
    defaultLanguageModel: 'google/gemini-3.1-flash-lite',
  };
}

async function resolveAiCreditsWorkspaceId({
  accessClient,
  userId,
  wsId,
}: {
  accessClient: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  if (wsId.toLowerCase() !== PERSONAL_WORKSPACE_SLUG) {
    const resolvedWorkspaceId = resolveWorkspaceId(wsId);
    if (isWorkspaceUuidLiteral(resolvedWorkspaceId)) {
      return resolvedWorkspaceId;
    }

    const { data: workspace, error } = await accessClient
      .from('workspaces')
      .select('id')
      .eq('handle', wsId.trim().toLowerCase())
      .maybeSingle();

    if (error || !workspace?.id) {
      throw new AiCreditsStatusError('Workspace not found', 404);
    }

    return workspace.id;
  }

  const { data, error } = await accessClient
    .from('workspaces')
    .select('id, workspace_members!inner(user_id, type)')
    .eq('personal', true)
    .eq('workspace_members.user_id', userId)
    .eq('workspace_members.type', 'MEMBER')
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new AiCreditsStatusError('Personal workspace not found', 404);
  }

  return data.id;
}

export async function getAiCreditsStatus({
  accessClient,
  userId,
  wsId,
}: {
  accessClient: TypedSupabaseClient;
  userId: string;
  wsId: string;
}) {
  const normalizedWsId = await resolveAiCreditsWorkspaceId({
    accessClient,
    userId,
    wsId,
  });

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId,
    supabase: accessClient,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    throw new AiCreditsStatusError(
      'Failed to verify workspace membership',
      500
    );
  }

  if (!memberCheck.ok) {
    throw new AiCreditsStatusError('Workspace access denied', 403);
  }

  const sbAdmin = await createAdminClient();
  const { data: resolvedTier } = await sbAdmin.rpc('_resolve_workspace_tier', {
    p_ws_id: normalizedWsId,
  });
  const tier = (resolvedTier ?? 'FREE') as ProductTier;
  const balanceScope: 'user' | 'workspace' =
    tier === 'FREE' ? 'user' : 'workspace';

  const { data: balanceRows, error: balanceError } = await sbAdmin.rpc(
    'get_or_create_credit_balance',
    { p_ws_id: normalizedWsId, p_user_id: userId }
  );

  if (balanceError) {
    console.error('Error getting credit balance:', balanceError);
    throw new AiCreditsStatusError('Failed to get credit balance', 500);
  }

  const balance = Array.isArray(balanceRows) ? balanceRows[0] : balanceRows;
  if (!balance) {
    throw new AiCreditsStatusError('No balance found', 500);
  }

  const includedAllocated = Number(balance.total_allocated ?? 0);
  const includedUsed = Number(balance.total_used ?? 0);
  const bonusCredits = Number(balance.bonus_credits ?? 0);
  const includedRemaining = includedAllocated + bonusCredits - includedUsed;

  const { data: paygRows, error: paygError } = await sbAdmin
    .from('workspace_credit_pack_purchases')
    .select('tokens_granted, tokens_remaining, expires_at, status')
    .eq('ws_id', normalizedWsId)
    .in('status', ['active', 'canceled'])
    .gt('expires_at', new Date().toISOString());

  if (paygError) {
    console.error('Error fetching payg credit packs:', paygError);
    throw new AiCreditsStatusError('Failed to get pay-as-you-go balances', 500);
  }

  const paygTotalGranted = (paygRows ?? []).reduce(
    (sum: number, row: { tokens_granted: number | null }) =>
      sum + Number(row.tokens_granted ?? 0),
    0
  );
  const paygRemaining = (paygRows ?? []).reduce(
    (sum: number, row: { tokens_remaining: number | null }) =>
      sum + Number(row.tokens_remaining ?? 0),
    0
  );
  const paygUsed = paygTotalGranted - paygRemaining;

  const nextExpiry = (paygRows ?? [])
    .map((row: { expires_at: string }) => row.expires_at)
    .filter((value: unknown): value is string => typeof value === 'string')
    .sort(
      (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime()
    )[0];

  const totalAllocated = includedAllocated + paygTotalGranted;
  const totalUsed = includedUsed + paygUsed;
  const remaining = includedRemaining + paygRemaining;
  const totalPool = totalAllocated + bonusCredits;
  const percentUsed = totalPool > 0 ? (totalUsed / totalPool) * 100 : 0;

  const { data: allocationData } = await sbAdmin
    .from('ai_credit_plan_allocations')
    .select('*')
    .eq('tier', tier)
    .eq('is_active', true)
    .maybeSingle();

  const allocation = allocationData as AllocationDefaults | null;
  const fallbackDefaults = getFallbackDefaultModels(tier);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: dailyTransactions } = await sbAdmin
    .from('ai_credit_transactions')
    .select('amount')
    .eq('balance_id', balance.id)
    .eq('transaction_type', 'deduction')
    .gte('created_at', todayStart.toISOString());

  const dailyUsed = (dailyTransactions ?? []).reduce(
    (sum: number, transaction: { amount: number }) =>
      sum + Math.abs(Number(transaction.amount)),
    0
  );

  let seatCount: number | null = null;
  if (balanceScope === 'workspace') {
    const { data: subscription } = await sbAdmin
      .from('workspace_subscriptions')
      .select('seat_count')
      .eq('ws_id', normalizedWsId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    seatCount = subscription?.seat_count ?? null;
  }

  await writeAiCreditSnapshot({
    wsId: normalizedWsId,
    userId,
    snapshot: {
      remainingCredits: remaining,
      maxOutputTokens: allocation?.max_output_tokens_per_request ?? null,
      tier,
      allowedModels: allocation?.allowed_models ?? [],
      allowedFeatures: allocation?.allowed_features ?? [],
      dailyLimit: allocation?.daily_limit
        ? Number(allocation.daily_limit)
        : null,
      updatedAt: Date.now(),
    },
  });

  return {
    totalAllocated,
    totalUsed,
    remaining,
    bonusCredits,
    percentUsed,
    included: {
      totalAllocated: includedAllocated,
      totalUsed: includedUsed,
      bonusCredits,
      remaining: includedRemaining,
    },
    payg: {
      totalGranted: paygTotalGranted,
      totalUsed: paygUsed,
      remaining: paygRemaining,
      nextExpiry: nextExpiry ?? null,
    },
    periodStart: balance.period_start,
    periodEnd: balance.period_end,
    tier,
    allowedModels: allocation?.allowed_models ?? [],
    allowedFeatures: allocation?.allowed_features ?? [],
    defaultImageModel:
      allocation?.default_image_model ?? fallbackDefaults.defaultImageModel,
    defaultLanguageModel:
      allocation?.default_language_model ??
      fallbackDefaults.defaultLanguageModel,
    dailyLimit: allocation?.daily_limit ? Number(allocation.daily_limit) : null,
    dailyUsed,
    maxOutputTokens: allocation?.max_output_tokens_per_request ?? null,
    balanceScope,
    seatCount,
  };
}
