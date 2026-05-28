import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);
  const wsId = await normalizeWorkspaceId(id, supabase);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('view_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view inventory' },
      { status: 403 }
    );
  }
  const inventory = (await createAdminClient()).schema('private');

  const { data, error } = await inventory
    .from('inventory_warehouses')
    .select('*')
    .eq('ws_id', wsId);

  if (error) {
    serverLogger.error('Error fetching product warehouses', error);
    return NextResponse.json(
      { message: 'Error fetching product warehouses' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(req);
  const wsId = await normalizeWorkspaceId(id, supabase);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create warehouses' },
      { status: 403 }
    );
  }
  const data = await req.json();

  const inventory = (await createAdminClient()).schema('private');

  const { error } = await inventory.from('inventory_warehouses').insert({
    ...data,
    ws_id: wsId,
  });

  if (error) {
    serverLogger.error('Error creating product warehouse', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
