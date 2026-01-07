import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
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

  // Verify the payroll run exists and belongs to this workspace
  const { data: payrollRun } = await supabase
    .from('payroll_runs')
    .select('id')
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!payrollRun) {
    return NextResponse.json(
      { error: 'Payroll run not found' },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from('payroll_run_items')
    .select('*')
    .eq('run_id', runId)
    .eq('ws_id', normalizedWsId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching payroll run items:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
