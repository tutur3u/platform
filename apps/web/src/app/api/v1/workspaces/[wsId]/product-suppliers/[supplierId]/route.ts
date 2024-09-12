import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    supplierId: string;
  };
}

export async function PUT(
  req: Request,
  { params: { supplierId: id } }: Params
) {
  const supabase = createClient();
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

export async function DELETE(
  _: Request,
  { params: { supplierId: id } }: Params
) {
  const supabase = createClient();

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
