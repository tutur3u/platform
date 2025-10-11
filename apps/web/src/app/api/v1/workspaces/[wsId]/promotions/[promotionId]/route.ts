import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    promotionId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, promotionId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update promotions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('workspace_promotions')
    .update({
      ...data,
      // TODO: better handling boolean value, as expand to further units
      unit: undefined,
      use_ratio: data.unit === 'percentage',
    })
    .eq('id', promotionId);

  if (error) {
    // TODO: logging
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const { wsId, promotionId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete promotions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('workspace_promotions')
    .delete()
    .eq('id', promotionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
