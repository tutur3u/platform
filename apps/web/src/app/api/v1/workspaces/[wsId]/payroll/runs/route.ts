import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createPayrollRunSchema = z.object({
  name: z.string().min(1),
  period_start: z.string(),
  period_end: z.string(),
  currency: z.string().default('VND'),
  notes: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get('status');

  const permissions = await getPermissions({ wsId: normalizedWsId });
  const hasViewPermission =
    permissions.containsPermission('view_payroll') ||
    permissions.containsPermission('manage_payroll');

  if (!hasViewPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  let query = supabase
    .from('payroll_runs')
    .select('*')
    .eq('ws_id', normalizedWsId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query.order('period_start', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching payroll runs:', error);
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
  if (!permissions.containsPermission('manage_payroll')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = createPayrollRunSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  // Validate period dates
  const periodStart = new Date(validation.data.period_start);
  const periodEnd = new Date(validation.data.period_end);

  if (periodEnd <= periodStart) {
    return NextResponse.json(
      { error: 'period_end must be after period_start' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('payroll_runs')
    .insert({
      ws_id: normalizedWsId,
      status: 'draft',
      created_by: user.id,
      ...validation.data,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating payroll run:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
