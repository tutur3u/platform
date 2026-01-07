import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateCompensationSchema = z.object({
  base_salary_monthly: z.number().nonnegative().optional(),
  base_salary_annual: z.number().nonnegative().optional(),
  base_hourly_rate: z.number().nonnegative().optional(),
  insurance_salary: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  payment_frequency: z
    .enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annually'])
    .optional(),
  overtime_threshold_daily_hours: z.number().positive().optional(),
  overtime_multiplier_daily: z.number().min(1).optional(),
  overtime_multiplier_weekend: z.number().min(1).optional(),
  overtime_multiplier_holiday: z.number().min(1).optional(),
  effective_from: z.string().optional(),
  effective_until: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; compensationId: string }> }
) {
  const { wsId, compensationId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  const hasViewPermission =
    permissions.containsPermission('view_workforce') ||
    permissions.containsPermission('manage_workforce');

  if (!hasViewPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workforce_compensation')
    .select('*')
    .eq('id', compensationId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.error('Error fetching compensation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Compensation record not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; compensationId: string }> }
) {
  const { wsId, compensationId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = updateCompensationSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workforce_compensation')
    .update(validation.data)
    .eq('id', compensationId)
    .eq('ws_id', normalizedWsId)
    .select()
    .single();

  if (error) {
    console.error('Error updating compensation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Compensation record not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; compensationId: string }> }
) {
  const { wsId, compensationId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('workforce_compensation')
    .delete()
    .eq('id', compensationId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting compensation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
