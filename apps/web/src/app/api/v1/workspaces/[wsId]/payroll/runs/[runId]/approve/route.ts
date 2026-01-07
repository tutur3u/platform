import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; runId: string }> }
) {
  const { wsId, runId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_payroll')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check current status
  const { data: existingRun } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (!existingRun) {
    return NextResponse.json(
      { error: 'Payroll run not found' },
      { status: 404 }
    );
  }

  if (existingRun.status === 'draft') {
    return NextResponse.json(
      {
        error:
          'Cannot approve draft payroll run. Please calculate payroll first.',
      },
      { status: 400 }
    );
  }

  if (existingRun.status === 'approved') {
    return NextResponse.json(
      { error: 'Payroll run is already approved' },
      { status: 400 }
    );
  }

  if (existingRun.status === 'finalized') {
    return NextResponse.json(
      { error: 'Cannot approve finalized payroll run' },
      { status: 400 }
    );
  }

  // Update status to approved
  const { data, error } = await supabase
    .from('payroll_runs')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .select()
    .single();

  if (error) {
    console.error('Error approving payroll run:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
