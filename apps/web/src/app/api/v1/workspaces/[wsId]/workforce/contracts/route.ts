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
  const userId = searchParams.get('userId');

  const permissions = await getPermissions({ wsId: normalizedWsId });
  const hasViewPermission =
    permissions.containsPermission('view_workforce') ||
    permissions.containsPermission('manage_workforce');

  if (!hasViewPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  let query = supabase
    .from('workforce_contracts')
    .select('*, workforce_compensation(*), workforce_benefits(*)')
    .eq('ws_id', normalizedWsId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching contracts:', error);
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
    user_id,
    contract_type,
    job_title,
    department,
    start_date,
    end_date,
    file_url,
  } = body;

  if (!user_id || !start_date || !contract_type) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Create contract
  const { data: contract, error: contractError } = await supabase
    .from('workforce_contracts')
    .insert({
      ws_id: normalizedWsId,
      user_id,
      contract_type,
      job_title,
      department,
      start_date,
      end_date,
      file_url,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .select()
    .single();

  if (contractError) {
    console.error('Error creating contract:', contractError);
    return NextResponse.json({ error: contractError.message }, { status: 500 });
  }

  return NextResponse.json(contract);
}
