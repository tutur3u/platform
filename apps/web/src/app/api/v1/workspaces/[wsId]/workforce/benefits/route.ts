import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const contractId = searchParams.get('contractId');

  if (!contractId) {
    return NextResponse.json(
      { error: 'Contract ID required' },
      { status: 400 }
    );
  }

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
    .eq('ws_id', normalizedWsId)
    .eq('contract_id', contractId);

  if (error) {
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
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const {
    contract_id,
    benefit_type,
    name,
    amount,
    currency = 'VND',
    is_recurring = true,
    recurrence_period = 'monthly',
    effective_from = new Date().toISOString(),
  } = body;

  if (!contract_id || !benefit_type || !amount) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workforce_benefits')
    .insert({
      ws_id: normalizedWsId,
      contract_id,
      benefit_type,
      name,
      amount,
      currency,
      is_recurring,
      recurrence_period,
      effective_from,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating benefit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
