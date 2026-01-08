import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateLeaveBalanceSchema = z.object({
  accrued_days: z.number().min(0).max(99999.99).optional(),
  used_days: z.number().min(0).max(99999.99).optional(),
  carried_over_days: z.number().min(0).max(99999.99).optional(),
  adjusted_days: z.number().min(-99999.99).max(99999.99).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; balanceId: string }> }
) {
  const { wsId, balanceId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view leave balances
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
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
    .eq('id', balanceId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.error('Error fetching leave balance:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Leave balance not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; balanceId: string }> }
) {
  const { wsId, balanceId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = updateLeaveBalanceSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leave_balances')
    .update(validation.data)
    .eq('id', balanceId)
    .eq('ws_id', normalizedWsId)
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
    console.error('Error updating leave balance:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Leave balance not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; balanceId: string }> }
) {
  const { wsId, balanceId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('leave_balances')
    .delete()
    .eq('id', balanceId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting leave balance:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
