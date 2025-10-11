import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    supplierId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, supplierId: id } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update suppliers' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('inventory_suppliers')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const { wsId, supplierId: id } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete suppliers' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('inventory_suppliers')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting product category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
