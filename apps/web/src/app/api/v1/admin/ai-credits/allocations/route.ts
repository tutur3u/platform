import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
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

export async function GET() {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .select('*')
      .order('tier');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch allocations' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in allocations GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  monthly_credits: z.number().optional(),
  credits_per_seat: z.number().nullable().optional(),
  daily_limit: z.number().nullable().optional(),
  max_output_tokens_per_request: z.number().nullable().optional(),
  markup_multiplier: z.number().optional(),
  allowed_models: z.array(z.string()).optional(),
  allowed_features: z.array(z.string()).optional(),
  max_requests_per_day: z.number().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PUT(req: Request) {
  try {
    const auth = await requireRootAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const sbAdmin = await createAdminClient();

    // Fetch the allocation before update to know the tier
    const { data: existing } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .select('tier, monthly_credits')
      .eq('id', id)
      .single();

    const { data, error } = await sbAdmin
      .from('ai_credit_plan_allocations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update allocation' },
        { status: 500 }
      );
    }

    // If FREE tier monthly_credits changed, propagate to all current-period user balances
    if (
      existing?.tier === 'FREE' &&
      updates.monthly_credits != null &&
      updates.monthly_credits !== Number(existing.monthly_credits)
    ) {
      const periodStart = new Date();
      periodStart.setUTCDate(1);
      periodStart.setUTCHours(0, 0, 0, 0);

      // Update all FREE user-level balances (ws_id IS NULL) for the current period
      const { error: propagateError, count } = await sbAdmin
        .from('workspace_ai_credit_balances')
        .update({
          total_allocated: updates.monthly_credits,
          updated_at: new Date().toISOString(),
        })
        .is('ws_id', null)
        .not('user_id', 'is', null)
        .eq('period_start', periodStart.toISOString());

      if (propagateError) {
        console.error('Error propagating FREE tier credits:', propagateError);
      }

      return NextResponse.json({
        ...data,
        balances_updated: count ?? 0,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in allocations PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
