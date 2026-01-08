import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateLeaveTypeSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  is_paid: z.boolean().optional(),
  requires_approval: z.boolean().optional(),
  allow_half_days: z.boolean().optional(),
  accrual_rate_days_per_month: z.number().min(0).max(99.99).optional(),
  max_balance_days: z.number().min(0).max(9999.99).nullable().optional(),
  max_carryover_days: z.number().min(0).max(9999.99).optional(),
  is_tet_leave: z.boolean().optional(),
  is_wedding_leave: z.boolean().optional(),
  is_funeral_leave: z.boolean().optional(),
  category: z.enum(['standard', 'parental', 'special', 'custom']).optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; typeId: string }> }
) {
  const { wsId, typeId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view leave types
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('id', typeId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.error('Error fetching leave type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Leave type not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; typeId: string }> }
) {
  const { wsId, typeId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = updateLeaveTypeSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leave_types')
    .update(validation.data)
    .eq('id', typeId)
    .eq('ws_id', normalizedWsId)
    .select()
    .single();

  if (error) {
    console.error('Error updating leave type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Leave type not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; typeId: string }> }
) {
  const { wsId, typeId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  // Check if leave type has associated balances or requests
  const { count: balanceCount } = await supabase
    .from('leave_balances')
    .select('*', { count: 'exact', head: true })
    .eq('leave_type_id', typeId);

  if (balanceCount && balanceCount > 0) {
    return NextResponse.json(
      {
        error:
          'Cannot delete leave type with existing balances. Please deactivate instead.',
      },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('leave_types')
    .delete()
    .eq('id', typeId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting leave type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
