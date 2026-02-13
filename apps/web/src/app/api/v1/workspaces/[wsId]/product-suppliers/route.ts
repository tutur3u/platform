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
  const permissions = await getPermissions({ wsId: id });
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

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_suppliers')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace user groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: id } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId: id });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create suppliers' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const data = await req.json();

  const { error } = await supabase.from('inventory_suppliers').insert({
    ...data,
    ws_id: id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user group' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
