import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  // Fetch group indicators
  const { data: groupIndicators, error: indicatorsError } = await sbAdmin
    .from('healthcare_vitals')
    .select('id, name, factor, unit')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (indicatorsError) {
    console.error(indicatorsError);
    return NextResponse.json(
      { message: 'Error fetching group indicators' },
      { status: 500 }
    );
  }

  // Fetch user indicators
  const { data: userIndicators, error: userIndicatorsError } = await sbAdmin
    .from('user_indicators')
    .select(`
      user_id,
      indicator_id,
      value,
      healthcare_vitals!inner(group_id)
    `)
    .eq('healthcare_vitals.group_id', groupId);

  if (userIndicatorsError) {
    console.error(userIndicatorsError);
    return NextResponse.json(
      { message: 'Error fetching user indicators' },
      { status: 500 }
    );
  }

  // Fetch manager IDs
  const { data: managers, error: managersError } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('role', 'TEACHER');

  if (managersError) {
    console.error(managersError);
    return NextResponse.json(
      { message: 'Error fetching group managers' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    groupIndicators: groupIndicators || [],
    userIndicators: (userIndicators || []).map((ui) => ({
      user_id: ui.user_id,
      indicator_id: ui.indicator_id,
      value: ui.value,
    })),
    managerUserIds: (managers || []).map((m) => m.user_id),
  });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('create_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage indicators' },
      { status: 403 }
    );
  }

  const { name, unit, factor } = await req.json();

  if (!name) {
    return NextResponse.json({ message: 'Name is required' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('healthcare_vitals')
    .insert({
      name,
      unit: unit?.trim() || '',
      factor: factor || 1,
      ws_id: wsId,
      group_id: groupId,
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error creating indicator' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const values = (await req.json()) as {
    user_id: string;
    indicator_id: string;
    value: number | null;
  }[];

  if (!Array.isArray(values)) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin.from('user_indicators').upsert(
    values.map(({ user_id, indicator_id, value }) => ({
      user_id,
      indicator_id,
      value,
    }))
  );

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error updating indicator values' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
