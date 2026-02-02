import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId: id } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId: id });
  if (!containsPermission('view_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view inventory' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_warehouses')
    .select('*')
    .eq('ws_id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching product warehouses' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId: id });
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create warehouses' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const data = await req.json();

  const { error } = await supabase.from('inventory_warehouses').insert({
    ...data,
    ws_id: id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
