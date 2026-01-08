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

  let query: any = supabase
    .from('leave_balances')
    .select(
      `
      *,
      leave_type:leave_types(*),
      user:workspace_users(
        id,
        display_name,
        user:users(id, display_name, avatar_url)
      )
    `
    )
    .eq('ws_id', normalizedWsId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (leaveTypeId) {
    query = query.eq('leave_type_id', leaveTypeId);
  }

  if (year) {
    query = query.eq('balance_year', parseInt(year, 10));
  }

  query = query.order('balance_year', { ascending: false });
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching leave balances:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
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

  // Verify that user belongs to this workspace
  const { data: workspaceUser } = await supabase
    .from('workspace_users')
    .select('id')
    .eq('id', validation.data.user_id)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!workspaceUser) {
    return NextResponse.json(
      { error: 'User not found in this workspace' },
      { status: 404 }
    );
  }

  // Verify that leave type belongs to this workspace
  const { data: leaveType } = await supabase
    .from('leave_types')
    .select('id')
    .eq('id', validation.data.leave_type_id)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!leaveType) {
    return NextResponse.json(
      { error: 'Leave type not found in this workspace' },
      { status: 404 }
    );
  }

  // Check for existing balance for same user, type, and year
  const { data: existingBalance } = await supabase
    .from('leave_balances')
    .select('id')
    .eq('user_id', validation.data.user_id)
    .eq('leave_type_id', validation.data.leave_type_id)
    .eq('balance_year', validation.data.balance_year)
    .eq('ws_id', normalizedWsId)
    .single();

  if (existingBalance) {
    return NextResponse.json(
      {
        error:
          'Leave balance already exists for this user, leave type, and year',
      },
      { status: 400 }
    );
  }

  // Get current user for created_by field
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('leave_balances')
    .insert({
      ws_id: normalizedWsId,
      created_by: user.id,
      ...validation.data,
    })
    .select(
      `
      *,
      leave_type:leave_types(*),
      user:workspace_users(
        id,
        display_name,
        user:users(id, display_name, avatar_url)
      )
    `
    )
    .single();

  if (error) {
    console.error('Error creating leave balance:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
