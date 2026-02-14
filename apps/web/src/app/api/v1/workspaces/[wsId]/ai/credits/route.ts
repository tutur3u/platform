import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Workspace membership check
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!memberCheck) {
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
      .eq('id', wsId)
      .maybeSingle();

    type ProductTier = 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';
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
      { p_ws_id: wsId, p_user_id: user.id }
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

    const totalAllocated = Number(balance.total_allocated ?? 0);
    const totalUsed = Number(balance.total_used ?? 0);
    const bonusCredits = Number(balance.bonus_credits ?? 0);
    const remaining = totalAllocated + bonusCredits - totalUsed;
    const percentUsed =
      totalAllocated + bonusCredits > 0
        ? (totalUsed / (totalAllocated + bonusCredits)) * 100
        : 0;

    // Get tier allocation
    const { data: allocation } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .maybeSingle();

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
        .eq('ws_id', wsId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      seatCount = subData?.seat_count ?? null;
    }

    return NextResponse.json({
      totalAllocated,
      totalUsed,
      remaining,
      bonusCredits,
      percentUsed: Math.min(percentUsed, 100),
      periodStart: balance.period_start,
      periodEnd: balance.period_end,
      tier,
      allowedModels: allocation?.allowed_models ?? [],
      allowedFeatures: allocation?.allowed_features ?? [],
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
