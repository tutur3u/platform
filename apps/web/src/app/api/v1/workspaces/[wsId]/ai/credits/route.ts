import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { writeAiCreditSnapshot } from '@tuturuuu/utils/ai-temp-auth';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

type ProductTier = 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';

type AllocationDefaults = {
  allowed_features: string[];
  allowed_models: string[];
  daily_limit: number | null;
  default_image_model?: string | null;
  default_language_model?: string | null;
  max_output_tokens_per_request: number | null;
};

function getFallbackDefaultModels(tier: ProductTier) {
  return {
    defaultImageModel:
      tier === 'FREE'
        ? 'google/imagen-4.0-fast-generate-001'
        : 'google/imagen-4.0-generate-001',
    defaultLanguageModel: 'google/gemini-2.5-flash-lite',
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(req);

    // Auth check — must run BEFORE normalizeWorkspaceId because resolving
    // "personal" requires an authenticated session.
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId);

    // Workspace membership check
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Resolve workspace tier
    const { data: tierData } = await sbAdmin
      .from('workspaces')
      .select(
        'id, workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
      )
      .eq('id', normalizedWsId)
      .maybeSingle();

    let tier: ProductTier = 'FREE';
    const subs = tierData?.workspace_subscriptions;
    if (Array.isArray(subs)) {
      const activeSub = subs
        .filter((s: any) => s?.status === 'active')
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
      if (activeSub?.workspace_subscription_products?.tier) {
        tier = activeSub.workspace_subscription_products.tier as ProductTier;
      }
    }

    const balanceScope: 'user' | 'workspace' =
      tier === 'FREE' ? 'user' : 'workspace';

    // Get or create current period balance (pass user.id for dual-track routing)
    const { data: balanceRows, error: balanceError } = await sbAdmin.rpc(
      'get_or_create_credit_balance',
      { p_ws_id: normalizedWsId, p_user_id: user.id }
    );

    if (balanceError) {
      console.error('Error getting credit balance:', balanceError);
      return NextResponse.json(
        { error: 'Failed to get credit balance' },
        { status: 500 }
      );
    }

    const balance = Array.isArray(balanceRows) ? balanceRows[0] : balanceRows;
    if (!balance) {
      return NextResponse.json({ error: 'No balance found' }, { status: 500 });
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
      return NextResponse.json(
        { error: 'Failed to get pay-as-you-go balances' },
        { status: 500 }
      );
    }

    const paygTotalGranted = (paygRows ?? []).reduce(
      (sum: number, row: any) => sum + Number(row.tokens_granted ?? 0),
      0
    );
    const paygRemaining = (paygRows ?? []).reduce(
      (sum: number, row: any) => sum + Number(row.tokens_remaining ?? 0),
      0
    );
    const paygUsed = paygTotalGranted - paygRemaining;

    const nextExpiry = (paygRows ?? [])
      .map((row: any) => row.expires_at)
      .filter((value: unknown): value is string => typeof value === 'string')
      .sort(
        (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime()
      )[0];

    const totalAllocated = includedAllocated + paygTotalGranted;
    const totalUsed = includedUsed + paygUsed;
    const remaining = includedRemaining + paygRemaining;
    const totalPool = totalAllocated + bonusCredits;
    const percentUsed = totalPool > 0 ? (totalUsed / totalPool) * 100 : 0;

    // Get tier allocation
    const { data: allocationData } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .maybeSingle();

    const allocation = allocationData as AllocationDefaults | null;
    const fallbackDefaults = getFallbackDefaultModels(tier);

    // Get daily usage (scoped to the balance)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: dailyTransactions } = await sbAdmin
      .from('ai_credit_transactions')
      .select('amount')
      .eq('balance_id', balance.id)
      .eq('transaction_type', 'deduction')
      .gte('created_at', todayStart.toISOString());

    const dailyUsed = (dailyTransactions ?? []).reduce(
      (sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)),
      0
    );

    // Get seat count for PAID workspaces
    let seatCount: number | null = null;
    if (balanceScope === 'workspace') {
      const { data: subData } = await sbAdmin
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
      wsId: normalizedWsId,
      userId: user.id,
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

    return NextResponse.json({
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
      dailyLimit: allocation?.daily_limit
        ? Number(allocation.daily_limit)
        : null,
      dailyUsed,
      maxOutputTokens: allocation?.max_output_tokens_per_request ?? null,
      balanceScope,
      seatCount,
    });
  } catch (error) {
    console.error('Error in AI credits route:', error);
    return NextResponse.json(
      { error: 'Failed to get AI credit status' },
      { status: 500 }
    );
  }
}
