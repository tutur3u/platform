import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;
  const { containsPermission } = await getPermissions({ wsId: id });
  if (!containsPermission('view_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view inventory' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('ws_id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching product categories' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId: id } = await params;

  const { containsPermission } = await getPermissions({ wsId: id });
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create inventory' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('product_categories').insert({
    ...data,
    ws_id: id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating inventory category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
