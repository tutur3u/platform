import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createLeaveBalanceSchema = z.object({
  user_id: z.string().uuid(),
  leave_type_id: z.string().uuid(),
  balance_year: z.number().int().min(2000).max(2100),
  accrued_days: z.number().min(0).max(99999.99).default(0),
  used_days: z.number().min(0).max(99999.99).default(0),
  carried_over_days: z.number().min(0).max(99999.99).default(0),
  adjusted_days: z.number().min(-99999.99).max(99999.99).default(0),
  notes: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  const leaveTypeId = searchParams.get('leaveTypeId');
  const year = searchParams.get('year');

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view leave balances
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  // Get current user for RPC call
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc(
    'get_leave_balances_with_details',
    {
      p_ws_id: normalizedWsId,
      p_user_id: user.id,
      p_filter_user_id: userId || undefined,
      p_filter_leave_type_id: leaveTypeId || undefined,
      p_filter_year: year ? parseInt(year, 10) : undefined,
    }
  );

  if (error) {
    console.error('Error fetching leave balances:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = createLeaveBalanceSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get current user for created_by field
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc(
    'create_leave_balance_with_details',
    {
      p_ws_id: normalizedWsId,
      p_user_id: validation.data.user_id,
      p_leave_type_id: validation.data.leave_type_id,
      p_balance_year: validation.data.balance_year,
      p_accrued_days: validation.data.accrued_days,
      p_used_days: validation.data.used_days,
      p_carried_over_days: validation.data.carried_over_days,
      p_adjusted_days: validation.data.adjusted_days,
      p_notes: validation.data.notes || undefined,
      p_created_by: user.id,
    }
  );

  if (error) {
    console.error('Error creating leave balance:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
