import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateHolidaySchema = z.object({
  name: z.string().min(1).optional(),
  holiday_date: z.string().optional(),
  is_recurring: z.boolean().optional(),
  overtime_multiplier: z.number().min(1).max(10).optional(),
  country_code: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; holidayId: string }> }
) {
  const { wsId, holidayId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view holidays
  const isMember = permissions.workspaceMembers.some(
    (m) => m.user_id === permissions.currentUser?.id
  );

  if (!isMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_holidays')
    .select('*')
    .eq('id', holidayId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.error('Error fetching holiday:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; holidayId: string }> }
) {
  const { wsId, holidayId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = updateHolidaySchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_holidays')
    .update(validation.data)
    .eq('id', holidayId)
    .eq('ws_id', normalizedWsId)
    .select()
    .single();

  if (error) {
    console.error('Error updating holiday:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; holidayId: string }> }
) {
  const { wsId, holidayId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('workspace_holidays')
    .delete()
    .eq('id', holidayId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
