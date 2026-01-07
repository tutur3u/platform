import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateBenefitSchema = z.object({
  benefit_type: z
    .enum([
      'health_insurance',
      'dental_insurance',
      'vision_insurance',
      'life_insurance',
      'retirement_401k',
      'pension',
      'stock_options',
      'meal_allowance',
      'transport_allowance',
      'phone_allowance',
      'internet_allowance',
      'performance_bonus',
      'signing_bonus',
      'annual_bonus',
      'vacation_days',
      'sick_leave',
      'parental_leave',
      'social_insurance',
      'grab_allowance',
      'google_workspace',
      'software_license',
      'training_budget',
      'gym_membership',
      'responsibility_allowance',
      'attendance_allowance',
      'hazardous_work_allowance',
      'housing_allowance',
      'petrol_allowance',
      'other',
    ])
    .optional(),
  name: z.string().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_period: z
    .enum(['monthly', 'quarterly', 'annually', 'one_time'])
    .optional(),
  effective_from: z.string().optional(),
  effective_until: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; benefitId: string }> }
) {
  const { wsId, benefitId } = await params;
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
    .from('workforce_benefits')
    .select('*')
    .eq('id', benefitId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.error('Error fetching benefit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Benefit record not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; benefitId: string }> }
) {
  const { wsId, benefitId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = updateBenefitSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workforce_benefits')
    .update(validation.data)
    .eq('id', benefitId)
    .eq('ws_id', normalizedWsId)
    .select()
    .single();

  if (error) {
    console.error('Error updating benefit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Benefit record not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; benefitId: string }> }
) {
  const { wsId, benefitId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('workforce_benefits')
    .delete()
    .eq('id', benefitId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting benefit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
