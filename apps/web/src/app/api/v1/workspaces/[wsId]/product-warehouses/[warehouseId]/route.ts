import { createClient } from '@repo/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    warehouseId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { warehouseId: id } = await params;

  const { error } = await supabase
    .from('inventory_warehouses')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating warehouse' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { warehouseId: id } = await params;

  const { error } = await supabase
    .from('inventory_warehouses')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
