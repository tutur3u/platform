import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

async function requireRootAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .single();

  if (memberError) {
    return {
      error: NextResponse.json(
        { error: 'Root workspace admin required' },
        { status: 403 }
      ),
    };
  }

  return { user };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get('limit') ?? 50))
    );
    const search = searchParams.get('search');
    const scopeFilter = searchParams.get('scope'); // 'user' | 'workspace'

    const sbAdmin = await createAdminClient();
    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);

    let query = sbAdmin
      .from('workspace_ai_credit_balances')
      .select('*', { count: 'exact' })
      .eq('period_start', periodStart.toISOString());

    if (search) {
      query = query.or(`ws_id.eq.${search},user_id.eq.${search}`);
    }

    if (scopeFilter === 'user') {
      query = query.not('user_id', 'is', null);
    } else if (scopeFilter === 'workspace') {
      query = query.not('ws_id', 'is', null);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('total_used', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch balances' },
        { status: 500 }
      );
    }

    // Enrich with workspace names and user details
    const wsIds = (data ?? []).map((b) => b.ws_id).filter(Boolean) as string[];
    const userIds = (data ?? [])
      .map((b) => b.user_id)
      .filter(Boolean) as string[];

    const [wsResult, userResult] = await Promise.all([
      wsIds.length > 0
        ? sbAdmin.from('workspaces').select('id, name').in('id', wsIds)
        : { data: [] },
      userIds.length > 0
        ? sbAdmin
            .from('users')
            .select('id, display_name, avatar_url')
            .in('id', userIds)
        : { data: [] },
    ]);

    const wsMap = new Map(
      (wsResult.data ?? []).map((w: { id: string; name: string | null }) => [
        w.id,
        w,
      ])
    );
    const userMap = new Map(
      (userResult.data ?? []).map(
        (u: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
        }) => [u.id, u]
      )
    );

    // Count members for workspaces
    const memberCounts = new Map<string, number>();
    if (wsIds.length > 0) {
      const { data: memberData } = await sbAdmin
        .from('workspace_members')
        .select('ws_id')
        .in('ws_id', wsIds);
      for (const m of memberData ?? []) {
        memberCounts.set(m.ws_id, (memberCounts.get(m.ws_id) ?? 0) + 1);
      }
    }

    const enriched = (data ?? []).map((balance) => ({
      ...balance,
      scope: balance.user_id ? 'user' : 'workspace',
      workspace: balance.ws_id
        ? {
            id: balance.ws_id,
            name: wsMap.get(balance.ws_id)?.name ?? null,
            member_count: memberCounts.get(balance.ws_id) ?? 0,
          }
        : null,
      user: balance.user_id
        ? {
            id: balance.user_id,
            display_name: userMap.get(balance.user_id)?.display_name ?? null,
            avatar_url: userMap.get(balance.user_id)?.avatar_url ?? null,
          }
        : null,
    }));

    return NextResponse.json({
      data: enriched,
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (error) {
    console.error('Error in balances GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const bonusSchema = z.object({
  balance_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json();
    const parsed = bonusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Read current balance, then increment
    const { data: current } = await sbAdmin
      .from('workspace_ai_credit_balances')
      .select('bonus_credits, ws_id, user_id')
      .eq('id', parsed.data.balance_id)
      .single();

    if (!current) {
      return NextResponse.json({ error: 'Balance not found' }, { status: 404 });
    }

    const newBonus = Number(current.bonus_credits ?? 0) + parsed.data.amount;

    const { error: updateError } = await sbAdmin
      .from('workspace_ai_credit_balances')
      .update({ bonus_credits: newBonus, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.balance_id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to add bonus credits' },
        { status: 500 }
      );
    }

    // Insert bonus transaction
    await sbAdmin.from('ai_credit_transactions').insert({
      ws_id: current.ws_id,
      user_id: current.user_id,
      balance_id: parsed.data.balance_id,
      transaction_type: 'bonus',
      amount: parsed.data.amount,
      metadata: { reason: parsed.data.reason ?? 'Admin bonus' },
    });

    return NextResponse.json({ success: true, bonusAdded: parsed.data.amount });
  } catch (error) {
    console.error('Error in balances POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
