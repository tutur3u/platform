import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    indicatorId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, indicatorId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage indicators' },
      { status: 403 }
    );
  }

  const { name, factor, unit } = await req.json();

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin
    .from('healthcare_vitals')
    .update({ name, factor, unit })
    .eq('id', indicatorId)
    .eq('ws_id', wsId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error updating indicator' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, indicatorId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('delete_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage indicators' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  // Instead of deleting, we set group_id to null as per original logic
  const { error } = await sbAdmin
    .from('healthcare_vitals')
    .update({ group_id: null })
    .eq('id', indicatorId)
    .eq('ws_id', wsId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error deleting indicator' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
