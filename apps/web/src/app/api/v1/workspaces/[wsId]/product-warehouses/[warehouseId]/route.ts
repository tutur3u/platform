import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    warehouseId: string;
  };
}

export async function PUT(
  req: Request,
  { params: { warehouseId: id } }: Params
) {
  const supabase = createClient();
  const data = await req.json();

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

export async function DELETE(
  _: Request,
  { params: { warehouseId: id } }: Params
) {
  const supabase = createClient();

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
