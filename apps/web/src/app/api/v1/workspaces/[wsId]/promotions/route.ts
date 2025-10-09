import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create promotions' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const data = await req.json();

  const { error } = await supabase.from('workspace_promotions').insert({
    ...data,
    ws_id: wsId,
    // TODO: better handling boolean value, as expand to further units
    unit: undefined,
    use_ratio: data.unit === 'percentage',
  });

  if (error) {
    // TODO: logging
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
