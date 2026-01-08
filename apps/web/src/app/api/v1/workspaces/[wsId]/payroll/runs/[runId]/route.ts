import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updatePayrollRunSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; runId: string }> }
) {
  const { wsId, runId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  const hasViewPermission =
    permissions.containsPermission('view_payroll') ||
    permissions.containsPermission('manage_payroll');

  if (!hasViewPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (error) {
    console.error('Error fetching payroll run:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Payroll run not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; runId: string }> }
) {
  const { wsId, runId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_payroll')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = updatePayrollRunSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Check if payroll run is in a state that allows updates
  const { data: existingRun } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (existingRun?.status === 'finalized') {
    return NextResponse.json(
      { error: 'Cannot update finalized payroll run' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('payroll_runs')
    .update(validation.data)
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .select()
    .single();

  if (error) {
    console.error('Error updating payroll run:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Payroll run not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; runId: string }> }
) {
  const { wsId, runId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_payroll')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  // Check if payroll run is in a state that allows deletion
  const { data: existingRun } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (existingRun?.status === 'finalized') {
    return NextResponse.json(
      { error: 'Cannot delete finalized payroll run' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('payroll_runs')
    .delete()
    .eq('id', runId)
    .eq('ws_id', normalizedWsId);

  if (error) {
    console.error('Error deleting payroll run:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
