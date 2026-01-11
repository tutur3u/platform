import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const calculateBalanceSchema = z.object({
  user_id: z.string().uuid().optional(),
  leave_type_id: z.string().uuid().optional(),
  balance_year: z.number().int().min(2000).max(2100),
  months_worked: z.number().int().min(1).max(12).default(12),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json(
      { error: 'Only managers can calculate leave balances' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const validation = calculateBalanceSchema.safeParse(body);

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

  const { user_id, leave_type_id, balance_year, months_worked } =
    validation.data;

  // Fetch leave types to calculate for
  let leaveTypesQuery = supabase
    .from('leave_types')
    .select('*')
    .eq('ws_id', normalizedWsId)
    .eq('is_active', true)
    .gt('accrual_rate_days_per_month', 0);

  if (leave_type_id) {
    leaveTypesQuery = leaveTypesQuery.eq('id', leave_type_id);
  }

  const { data: leaveTypes, error: leaveTypesError } = await leaveTypesQuery;

  if (leaveTypesError) {
    console.error('Error fetching leave types:', leaveTypesError);
    return NextResponse.json(
      { error: leaveTypesError.message },
      { status: 500 }
    );
  }

  if (!leaveTypes || leaveTypes.length === 0) {
    return NextResponse.json(
      {
        error: 'No active leave types with accrual rates found for calculation',
      },
      { status: 404 }
    );
  }

  // Fetch users to calculate for
  let usersQuery = supabase
    .from('workspace_users')
    .select('id, display_name, user:users(id, display_name)')
    .eq('ws_id', normalizedWsId);

  if (user_id) {
    usersQuery = usersQuery.eq('id', user_id);
  }

  const { data: workspaceUsers, error: usersError } = await usersQuery;

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  if (!workspaceUsers || workspaceUsers.length === 0) {
    return NextResponse.json(
      { error: 'No users found for calculation' },
      { status: 404 }
    );
  }

  const calculatedBalances: any[] = [];
  const errors: any[] = [];

  // Calculate balances for each user and leave type combination
  for (const workspaceUser of workspaceUsers) {
    for (const leaveType of leaveTypes) {
      // Calculate accrued days based on months worked
      const accruedDays =
        (leaveType.accrual_rate_days_per_month || 0) * months_worked;

      // Check if balance already exists
      const { data: existingBalance } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('ws_id', normalizedWsId)
        .eq('user_id', workspaceUser.id)
        .eq('leave_type_id', leaveType.id)
        .eq('balance_year', balance_year)
        .single();

      if (existingBalance) {
        // Update existing balance
        const { data: updated, error: updateError } = await supabase
          .from('leave_balances')
          .update({
            accrued_days: accruedDays,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingBalance.id)
          .select()
          .single();

        if (updateError) {
          errors.push({
            userId: workspaceUser.id,
            leaveTypeId: leaveType.id,
            error: updateError.message,
          });
        } else {
          calculatedBalances.push(updated);
        }
      } else {
        // Create new balance
        const { data: created, error: createError } = await supabase
          .from('leave_balances')
          .insert({
            ws_id: normalizedWsId,
            user_id: workspaceUser.id,
            leave_type_id: leaveType.id,
            balance_year,
            accrued_days: accruedDays,
            used_days: 0,
            carried_over_days: 0,
            adjusted_days: 0,
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) {
          errors.push({
            userId: workspaceUser.id,
            leaveTypeId: leaveType.id,
            error: createError.message,
          });
        } else {
          calculatedBalances.push(created);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    calculatedBalances,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      totalCalculated: calculatedBalances.length,
      totalErrors: errors.length,
      year: balance_year,
      monthsWorked: months_worked,
      usersProcessed: workspaceUsers.length,
      leaveTypesProcessed: leaveTypes.length,
    },
  });
}
